'use client';
import React, { useState, useEffect, useRef } from 'react'; // Import React for createRef
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Trash2, Edit, X, Check, Clock, ArrowLeft, MoreVertical, UserX } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Simple hook to detect clicks outside an element
const useClickOutside = (ref, callback) => {
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if the ref has a current value before accessing contains
            if (ref?.current && !ref.current.contains(event.target)) {
                callback();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref, callback]);
};

export default function ChatWindow({ chatUser, onBack, handleRemoveFriend }) {
    const { user, socket } = useAuth();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editText, setEditText] = useState('');
    const [openMessageMenuId, setOpenMessageMenuId] = useState(null);
    const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
    const messagesEndRef = useRef(null);
    const headerMenuRef = useRef(null);
    const messageMenuRefs = useRef({}); // Use an object to store refs for multiple message menus

    // Close header menu when clicking outside
    useClickOutside(headerMenuRef, () => setIsHeaderMenuOpen(false));

    // Close the currently open message menu when clicking outside
    // More complex logic to handle multiple refs and the menu button itself
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!openMessageMenuId) return; // No menu open, do nothing

            const menuRef = messageMenuRefs.current[openMessageMenuId];
            const menuButton = document.getElementById(`menu-btn-${openMessageMenuId}`);

            // Check if click is outside the menu *and* outside its button
            if (menuRef?.current && !menuRef.current.contains(event.target) &&
                menuButton && !menuButton.contains(event.target))
            {
                setOpenMessageMenuId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [openMessageMenuId]); // Re-run when the open menu changes

    // Fetch historical messages
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

    // Setup socket listeners
    useEffect(() => {
        if (!socket || !chatUser || !user) return; // Important guard clause

        const handleReceiveMessage = (message) => {
            setMessages(prev => {
                const optimisticId = prev.find(m => m._id.startsWith('temp-') && m.content === message.content && m.sender?._id === user.id)?._id;
                if (optimisticId) {
                    // Replace optimistic message with server confirmed one
                    return prev.map(m => m._id === optimisticId ? message : m);
                }
                // Add message if it's from the current chat partner
                if (message.sender?._id === chatUser._id) {
                    return [...prev, message];
                }
                return prev; // Otherwise, don't change state
            });
        };
        const handleMessageEdited = (editedMessage) => setMessages(prev => prev.map(msg => msg._id === editedMessage._id ? editedMessage : msg));
        const handleMessageDeleted = ({ messageId }) => setMessages(prev => prev.filter(msg => msg._id !== messageId));

        socket.on('receive_message', handleReceiveMessage);
        socket.on('message_edited', handleMessageEdited);
        socket.on('message_deleted', handleMessageDeleted);

        return () => {
            socket.off('receive_message', handleReceiveMessage);
            socket.off('message_edited', handleMessageEdited);
            socket.off('message_deleted', handleMessageDeleted);
        };
    }, [socket, chatUser, user]);

    // Auto-scroll effect
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // --- Action Handlers ---
    const handleSendMessage = (e) => {
        e.preventDefault();
        if (newMessage.trim() === '' || !user?.id || !chatUser?._id) return; // Guards

        const optimisticMessage = {
            _id: `temp-${Date.now()}`,
            sender: { _id: user.id, username: user.username },
            content: newMessage,
            timestamp: new Date().toISOString(),
            edited: false,
        };
        setMessages(prev => [...prev, optimisticMessage]);
        socket.emit('private_message', { recipientId: chatUser._id, content: newMessage, });
        setNewMessage('');
    };

    const handleDeleteMessage = async (messageId) => {
        if (!user?.id) return;
        if (window.confirm('Are you sure you want to delete this message?')) {
            try {
                setMessages(prev => prev.filter(msg => msg._id !== messageId));
                await axios.delete(`${API_URL}/api/messages/${messageId}`, { headers: { 'x-user-id': user.id } });
            } catch (error) {
                console.error("Failed to delete message:", error);
                 // Consider re-fetching messages here to revert optimistic update on error
                // fetchMessages(); // You might need to adapt fetchMessages to be callable here
            }
        }
        setOpenMessageMenuId(null);
    };

    const handleUpdateMessage = async (messageId) => {
        if (!user?.id) return;
        try {
            const { data: updatedMessage } = await axios.put(`${API_URL}/api/messages/${messageId}`, { content: editText }, { headers: { 'x-user-id': user.id } });
            setMessages(prev => prev.map(msg => msg._id === messageId ? updatedMessage : msg));
            setEditingMessageId(null);
            setEditText('');
        } catch (error) {
            console.error("Failed to update message:", error);
        }
        setOpenMessageMenuId(null);
    };

    const startEditing = (message) => {
        setEditingMessageId(message._id);
        setEditText(message.content);
        setOpenMessageMenuId(null);
    };

    const cancelEditing = () => {
        setEditingMessageId(null);
        setEditText('');
    };

    const toggleMessageMenu = (messageId) => {
        setOpenMessageMenuId(prev => (prev === messageId ? null : messageId));
    };

    const handleHeaderRemoveFriend = () => {
        if (handleRemoveFriend && chatUser?._id) {
            handleRemoveFriend(chatUser._id);
        }
        setIsHeaderMenuOpen(false);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* --- Header --- */}
            <header className="p-4 bg-white border-b border-gray-200 flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-4 min-w-0">
                    <button onClick={onBack} className="md:hidden p-2 -ml-2 text-gray-500 hover:text-indigo-600">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-xl font-semibold text-gray-800 truncate">{chatUser?.username}</h2>
                </div>
                <div className="relative md:hidden" ref={headerMenuRef}>
                    <button onClick={() => setIsHeaderMenuOpen(prev => !prev)} className="p-2 text-gray-500 hover:text-indigo-600">
                        <MoreVertical size={20} />
                    </button>
                    <AnimatePresence>
                        {isHeaderMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.1 }}
                                className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-100 overflow-hidden"
                            >
                                <button onClick={handleHeaderRemoveFriend} className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                    <UserX size={16} className="mr-2" /> Remove Friend
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </header>

            {/* --- Messages Area --- */}
            <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-1">
                <AnimatePresence>
                    {messages.map((msg) => {
                        // Basic validation
                        if (!msg?._id || !msg?.sender?._id) return null;

                        const isTemp = msg._id.startsWith('temp-');
                        const isMyMessage = msg.sender._id === user?.id;

                        // Ensure ref exists for the menu
                        if (!messageMenuRefs.current[msg._id]) {
                            messageMenuRefs.current[msg._id] = React.createRef();
                        }
                        const currentMenuRef = messageMenuRefs.current[msg._id];

                        return (
                        <motion.div key={msg._id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }} className={`flex items-end gap-2 ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                            <div className={`relative flex items-end gap-1 ${isMyMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`px-4 py-2 rounded-2xl max-w-lg ${isMyMessage ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none shadow-sm'}`}>
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

                                {/* Message Kebab Menu */}
                                {isMyMessage && !isTemp && (
                                    <div ref={currentMenuRef} className="relative">
                                        <button id={`menu-btn-${msg._id}`} onClick={() => toggleMessageMenu(msg._id)} className={`p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 mb-1`}>
                                            <MoreVertical size={16}/>
                                        </button>
                                        <AnimatePresence>
                                            {openMessageMenuId === msg._id && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.1 }}
                                                    className={`absolute ${isMyMessage ? 'right-full mr-1' : 'left-full ml-1'} bottom-0 mb-1 w-28 bg-white rounded-md shadow-lg z-10 border border-gray-100 overflow-hidden`}
                                                >
                                                    <button onClick={() => startEditing(msg)} className="flex items-center w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"> <Edit size={14} className="mr-2"/> Edit </button>
                                                    <button onClick={() => handleDeleteMessage(msg._id)} className="flex items-center w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"> <Trash2 size={14} className="mr-2"/> Delete </button>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                                {isMyMessage && isTemp && ( <div className="p-1 text-gray-400 animate-pulse mb-1"><Clock size={14} /></div> )}
                            </div>
                        </motion.div>
                    )})}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* --- Footer --- */}
            <footer className="p-4 bg-white border-t border-gray-200 flex-shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                    <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." className="w-full px-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button type="submit" className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-md"> <Send size={20} /> </button>
                </form>
            </footer>
        </div>
    );
}