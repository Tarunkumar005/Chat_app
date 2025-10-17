'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, Edit, X, Check, Clock } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ChatWindow({ chatUser }) {
    const { user, socket } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editText, setEditText] = useState('');
    const messagesEndRef = useRef(null);

    // Fetch historical messages when a chat is opened
    useEffect(() => {
        const fetchMessages = async () => {
            if (!chatUser?._id || !user?.id) return;
            try {
                const { data } = await axios.get(`${API_URL}/api/messages/${chatUser._id}`, {
                    headers: { 'x-user-id': user.id }
                });
                setMessages(data);
            } catch (error) {
                console.error("Failed to fetch messages:", error);
                setMessages([]);
            }
        };
        fetchMessages();
    }, [chatUser, user]);

    // Setup all socket listeners for real-time updates
    useEffect(() => {
        if (!socket || !chatUser || !user) return;

        const handleReceiveMessage = (message) => {
            // Replace the optimistic message with the real one from the server
            setMessages(prev => {
                const optimisticId = prev.find(m => m.content === message.content && m.sender._id === user.id && m._id.startsWith('temp-'))?._id;
                if (optimisticId) {
                    return prev.map(m => m._id === optimisticId ? message : m);
                }
                // Or add a new message if it's from the other user
                if (message.sender._id === chatUser._id) {
                    return [...prev, message];
                }
                return prev;
            });
        };
        const handleMessageEdited = (editedMessage) => {
            setMessages(prev => prev.map(msg => msg._id === editedMessage._id ? editedMessage : msg));
        };
        const handleMessageDeleted = ({ messageId }) => {
            setMessages(prev => prev.filter(msg => msg._id !== messageId));
        };

        socket.on('receive_message', handleReceiveMessage);
        socket.on('message_edited', handleMessageEdited);
        socket.on('message_deleted', handleMessageDeleted);

        return () => {
            socket.off('receive_message', handleReceiveMessage);
            socket.off('message_edited', handleMessageEdited);
            socket.off('message_deleted', handleMessageDeleted);
        };
    }, [socket, chatUser, user]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Handler functions for message actions
    const handleSendMessage = (e) => {
        e.preventDefault();
        if (newMessage.trim() === '' || !user) return;

        const optimisticMessage = {
            _id: `temp-${Date.now()}`,
            sender: { _id: user.id, username: user.username },
            content: newMessage,
            timestamp: new Date().toISOString(),
            edited: false,
        };
        setMessages(prev => [...prev, optimisticMessage]);
        
        socket.emit('private_message', {
            recipientId: chatUser._id,
            content: newMessage,
        });

        setNewMessage('');
    };

    const handleDeleteMessage = async (messageId) => {
        if (window.confirm('Are you sure you want to delete this message?')) {
            try {
                setMessages(prev => prev.filter(msg => msg._id !== messageId));
                await axios.delete(`${API_URL}/api/messages/${messageId}`, {
                    headers: { 'x-user-id': user.id }
                });
            } catch (error) {
                console.error("Failed to delete message:", error);
            }
        }
    };

    const handleUpdateMessage = async (messageId) => {
        try {
            const { data: updatedMessage } = await axios.put(`${API_URL}/api/messages/${messageId}`, 
                { content: editText },
                { headers: { 'x-user-id': user.id } }
            );
            setMessages(prev => prev.map(msg => msg._id === messageId ? updatedMessage : msg));
            setEditingMessageId(null);
            setEditText('');
        } catch (error) {
            console.error("Failed to update message:", error);
        }
    };

    const startEditing = (message) => {
        setEditingMessageId(message._id);
        setEditText(message.content);
    };
    
    const cancelEditing = () => {
        setEditingMessageId(null);
        setEditText('');
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <header className="p-4 bg-white border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">{chatUser.username}</h2>
            </header>

            <div className="flex-1 p-6 overflow-y-auto space-y-1">
                <AnimatePresence>
                    {messages.map((msg) => {
                        const isTemp = msg._id.startsWith('temp-');
                        return (
                        <motion.div 
                            key={msg._id} 
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className={`group flex items-end gap-2 ${msg.sender._id === user.id ? 'justify-end' : 'justify-start'}`}
                        >
                            {/* ✨ FIX: Only show actions if the message is NOT temporary */}
                            {msg.sender._id === user.id && !isTemp && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => startEditing(msg)} className="p-1 text-gray-400 hover:text-blue-500"><Edit size={14}/></button>
                                    <button onClick={() => handleDeleteMessage(msg._id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                                </div>
                            )}

                            {/* ✨ FIX: Show a clock icon for temporary messages */}
                            {msg.sender._id === user.id && isTemp && (
                                <div className="p-1 text-gray-400 animate-pulse">
                                    <Clock size={14} />
                                </div>
                            )}

                            <div className={`px-4 py-2 rounded-2xl max-w-lg ${msg.sender._id === user.id ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none shadow-sm'}`}>
                                {editingMessageId === msg._id ? (
                                    <div className="flex items-center gap-2">
                                        <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} className="bg-indigo-700 text-white p-1 rounded focus:outline-none" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleUpdateMessage(msg._id)} />
                                        <button onClick={() => handleUpdateMessage(msg._id)} className="p-1 hover:bg-indigo-500 rounded"><Check size={16}/></button>
                                        <button onClick={cancelEditing} className="p-1 hover:bg-indigo-500 rounded"><X size={16}/></button>
                                    </div>
                                ) : (
                                    <>
                                        <p className="break-words">{msg.content}</p>
                                        {msg.edited && <span className="text-xs opacity-70 ml-2">(edited)</span>}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    )})}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            <footer className="p-4 bg-white border-t border-gray-200">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="w-full px-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="submit" className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-md">
                        <Send size={20} />
                    </button>
                </form>
            </footer>
        </div>
    );
}