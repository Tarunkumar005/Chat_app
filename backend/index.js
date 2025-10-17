import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import cors from 'cors';
import { Server } from 'socket.io';

// --- 1. INITIAL SETUP ---
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, restrict this to your frontend's URL
    },
});

// --- 2. DATABASE & MODELS ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chatAppDB')
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    socketId: { type: String, default: null },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});
const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', messageSchema);

// Friend Request Schema
const friendRequestSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
});
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);


// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- 4. HTTP API ROUTES ---

// == AUTH ROUTES ==
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Username is already taken.' });
        }
        res.status(500).json({ message: 'Server error during registration.', error });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        res.status(200).json({ message: 'Login successful.', user: { username: user.username, id: user._id } });
    } catch (error) {
        res.status(500).json({ message: 'Server error during login.', error });
    }
});


// == USER ROUTES ==
app.get('/api/users', async (req, res) => {
    const currentUserId = req.headers['x-user-id'];
    try {
        const users = await User.find({ _id: { $ne: currentUserId } }).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users' });
    }
});

app.get('/api/users/me', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ message: 'User ID not provided' });

    try {
        const user = await User.findById(userId).select('-password').populate('friends', 'username');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/users/:userId/socket', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('socketId username');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ username: user.username, socketId: user.socketId });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


// == FRIEND REQUEST ROUTES ==
app.post('/api/friend-requests/send', async (req, res) => {
    const { senderId, recipientId } = req.body;
    try {
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { sender: senderId, recipient: recipientId },
                { sender: recipientId, recipient: senderId }
            ]
        });
        if (existingRequest) {
            return res.status(409).json({ message: 'Friend request already sent or received.' });
        }
        
        const newRequest = new FriendRequest({ sender: senderId, recipient: recipientId });
        await newRequest.save();

        const recipient = await User.findById(recipientId);
        if (recipient && recipient.socketId) {
            const sender = await User.findById(senderId);
            io.to(recipient.socketId).emit('new_friend_request', { from: sender.username });
        }
        
        res.status(201).json({ message: 'Friend request sent.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// REMOVE FRIEND ROUTE
app.post('/api/friends/remove', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { friendId } = req.body;

    if (!friendId) {
        return res.status(400).json({ message: 'Friend ID is required.' });
    }

    try {
        // Remove friend from the current user's list
        await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });

        // Remove the current user from the friend's list
        await User.findByIdAndUpdate(friendId, { $pull: { friends: userId } });
        
        // Delete the entire conversation
        await Message.deleteMany({
            $or: [
                { sender: userId, recipient: friendId },
                { sender: friendId, recipient: userId }
            ]
        });

        // ✨ THE FIX: Delete the original friend request document
        await FriendRequest.deleteOne({
            $or: [
                { sender: userId, recipient: friendId },
                { sender: friendId, recipient: userId }
            ]
        });
        
        // Notify the removed friend in real-time if they are online
        const removedFriend = await User.findById(friendId);
        if (removedFriend?.socketId) {
            io.to(removedFriend.socketId).emit('friend_removed', {
                removedById: userId,
            });
        }

        res.json({ message: 'Friend and conversation removed successfully.' });
    } catch (error) {
        console.error("Error removing friend:", error);
        res.status(500).json({ message: 'Server error while removing friend.' });
    }
});

app.get('/api/friend-requests/pending', async (req, res) => {
    const userId = req.headers['x-user-id'];
    try {
        const requests = await FriendRequest.find({ recipient: userId, status: 'pending' })
            .populate('sender', 'username');
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// POST: Accept a friend request (WITH THE FIX)
app.post('/api/friend-requests/:requestId/accept', async (req, res) => {
    const { requestId } = req.params;
    const userId = req.headers['x-user-id'];

    try {
        const request = await FriendRequest.findById(requestId)
            .populate('sender')      // <-- Populate sender
            .populate('recipient');  // <-- Populate recipient

        if (!request || request.recipient._id.toString() !== userId) {
            return res.status(404).json({ message: 'Request not found or you are not authorized.' });
        }
        
        request.status = 'accepted';
        await request.save();

        await User.findByIdAndUpdate(request.sender._id, { $addToSet: { friends: request.recipient._id } });
        await User.findByIdAndUpdate(request.recipient._id, { $addToSet: { friends: request.sender._id } });

        // ✨ THE FIX: Notify the original sender that their request was accepted
        if (request.sender.socketId) {
            io.to(request.sender.socketId).emit('request_accepted', {
                newFriend: {
                    _id: request.recipient._id,
                    username: request.recipient.username,
                }
            });
        }

        res.json({ message: 'Friend request accepted.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/friend-requests/:requestId/decline', async (req, res) => {
    const { requestId } = req.params;
    const userId = req.headers['x-user-id'];

    try {
        const request = await FriendRequest.findById(requestId);
        if (!request || request.recipient.toString() !== userId) {
            return res.status(404).json({ message: 'Request not found or you are not authorized.' });
        }

        request.status = 'declined';
        await request.save();
        
        res.json({ message: 'Friend request declined.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// GET: Fetch historical messages between two users
app.get('/api/messages/:friendId', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { friendId } = req.params;
    try {
        const messages = await Message.find({
            $or: [
                { sender: userId, recipient: friendId },
                { sender: friendId, recipient: userId },
            ],
        }).sort({ timestamp: 1 }).populate('sender', 'username');
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch messages' });
    }
});

// PUT: Edit a message
app.put('/api/messages/:messageId', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { messageId } = req.params;
    const { content } = req.body;
    try {
        const message = await Message.findById(messageId).populate('sender', 'username');
        if (!message) return res.status(404).json({ message: 'Message not found' });
        if (message.sender._id.toString() !== userId) {
            return res.status(403).json({ message: 'You can only edit your own messages.' });
        }

        message.content = content;
        message.edited = true;
        await message.save();

        const recipient = await User.findById(message.recipient);
        if (recipient?.socketId) {
            io.to(recipient.socketId).emit('message_edited', message);
        }

        res.json(message);
    } catch (error) {
        res.status(500).json({ message: 'Failed to edit message' });
    }
});

// DELETE: Delete a message
app.delete('/api/messages/:messageId', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { messageId } = req.params;
    try {
        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ message: 'Message not found' });
        if (message.sender.toString() !== userId) {
            return res.status(403).json({ message: 'You can only delete your own messages.' });
        }

        await Message.findByIdAndDelete(messageId);

        const recipient = await User.findById(message.recipient);
        if (recipient?.socketId) {
            io.to(recipient.socketId).emit('message_deleted', { messageId });
        }

        res.json({ message: 'Message deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete message' });
    }
});


// --- 5. REAL-TIME LOGIC WITH SOCKET.IO ---
io.use(async (socket, next) => {
    const username = socket.handshake.auth.username;
    if (!username) return next(new Error('Authentication error: Username not provided.'));
    try {
        const user = await User.findOne({ username });
        if (!user) return next(new Error('Authentication error: User not found.'));
        socket.user = user;
        next();
    } catch (error) {
        next(new Error('Server error during socket authentication.'));
    }
});

io.on('connection', async (socket) => {
    console.log(`🤝 User connected: ${socket.user.username} with socket ID: ${socket.id}`);
    
    socket.user.socketId = socket.id;
    await socket.user.save();
    io.emit('user_online', { username: socket.user.username });

    // ✨ UPDATED: Private message handler now saves messages
    socket.on('private_message', async ({ recipientId, content }) => {
        try {
            const recipient = await User.findById(recipientId);
            if (!recipient) return;

            const newMessage = new Message({
                sender: socket.user._id,
                recipient: recipientId,
                content: content,
            });
            await newMessage.save();
            // Populate sender info before emitting
            const populatedMessage = await Message.findById(newMessage._id).populate('sender', 'username');

            // Send to recipient in real-time
            if (recipient.socketId) {
                io.to(recipient.socketId).emit('receive_message', populatedMessage);
            }
            console.log(`   -> Message from ${socket.user.username} to ${recipient.username} saved.`);
        } catch (error) {
            console.error('   -> Error handling private message:', error);
        }
    });

    socket.on('disconnect', async () => {
        console.log(`🔌 User disconnected: ${socket.user.username}`);
        await User.updateOne({ _id: socket.user._id }, { $set: { socketId: null } });
        io.emit('user_offline', { username: socket.user.username });
    });
});


// --- 6. START THE SERVER ---
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});