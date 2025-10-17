'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Search, X, Check, LogOut, MessageSquare } from 'lucide-react';

const API_URL = 'http://localhost:8000';

export default function Sidebar({ onSelectChat }) {
    const { user, logout, socket } = useAuth();
    const [friends, setFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const api = axios.create({
        headers: { 'x-user-id': user.id }
    });

    // Encapsulate data fetching to avoid repetition
    const fetchUserData = useCallback(async () => {
        if (!user) return;
        try {
            const [meRes, requestsRes] = await Promise.all([
                api.get(`${API_URL}/api/users/me`),
                api.get(`${API_URL}/api/friend-requests/pending`)
            ]);
            setFriends(meRes.data.friends || []);
            setPendingRequests(requestsRes.data || []);
        } catch (error) {
            console.error("Failed to fetch user data", error);
        }
    }, [user]); // api instance is stable, user is the main dependency

    useEffect(() => {
        fetchUserData(); // Initial fetch

        // Listen for new friend requests coming TO you
        socket?.on('new_friend_request', (data) => {
            console.log('Received new friend request notification');
            fetchUserData(); // Re-fetch data
        });
        
        // ✨ THE FIX: Listen for when a request YOU SENT is accepted by someone else
        socket?.on('request_accepted', (data) => {
            console.log(`${data.newFriend.username} accepted your friend request!`);
            fetchUserData(); // Re-fetch to update friends list
        });
        
        // Cleanup listeners on component unmount
        return () => {
            socket?.off('new_friend_request');
            socket?.off('request_accepted'); // <-- Cleanup the new listener
        };

    }, [user, socket, fetchUserData]); // Add fetchUserData to dependency array

    useEffect(() => {
        if (searchTerm.length > 1) {
            const delayDebounceFn = setTimeout(async () => {
                const { data } = await api.get(`${API_URL}/api/users?term=${searchTerm}`);
                setSearchResults(data);
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setSearchResults([]);
        }
    }, [searchTerm]); // api instance is stable

    const sendFriendRequest = async (recipientId) => {
        await api.post(`${API_URL}/api/friend-requests/send`, { senderId: user.id, recipientId });
        setSearchTerm('');
    };

    const handleRequest = async (requestId, action) => {
        const url = `${API_URL}/api/friend-requests/${requestId}/${action}`;
        await api.post(url);
        fetchUserData(); // Refresh data after you accept/decline
    };

    return (
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
            {/* Header */}
            <header className="p-4 border-b flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-800">{user.username}</h1>
                <button onClick={logout} className="p-2 text-gray-500 hover:text-red-500 rounded-full hover:bg-gray-100 transition-colors">
                    <LogOut size={20} />
                </button>
            </header>
            
            {/* Search */}
            <div className="p-4 border-b">
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Find friends..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <AnimatePresence>
                {searchResults.length > 0 && (
                    <motion.div initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} exit={{opacity: 0, height: 0}} className="mt-2 bg-white rounded-lg shadow-md overflow-hidden">
                        {searchResults.map(foundUser => (
                            <div key={foundUser._id} className="p-2 flex justify-between items-center hover:bg-gray-50">
                                <span>{foundUser.username}</span>
                                <button onClick={() => sendFriendRequest(foundUser._id)} className="p-1 text-indigo-500 hover:bg-indigo-100 rounded-full">
                                    <UserPlus size={18} />
                                </button>
                            </div>
                        ))}
                    </motion.div>
                )}
                </AnimatePresence>
            </div>
            
            {/* Friend Requests */}
            <div className="p-4 border-b">
                <h2 className="text-sm font-semibold text-gray-500 mb-2">Pending Requests ({pendingRequests.length})</h2>
                <div className="space-y-2">
                    <AnimatePresence>
                    {pendingRequests.map(req => (
                        <motion.div key={req._id} layout initial={{opacity: 0, y: -10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, x: -20}} className="flex items-center justify-between">
                            <span>{req.sender.username}</span>
                            <div className="flex space-x-2">
                                <button onClick={() => handleRequest(req._id, 'accept')} className="p-1 text-green-500 hover:bg-green-100 rounded-full"><Check size={18} /></button>
                                <button onClick={() => handleRequest(req._id, 'decline')} className="p-1 text-red-500 hover:bg-red-100 rounded-full"><X size={18} /></button>
                            </div>
                        </motion.div>
                    ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* Friends List */}
            <div className="flex-1 p-4 overflow-y-auto">
                 <h2 className="text-sm font-semibold text-gray-500 mb-2">Friends ({friends.length})</h2>
                 <div className="space-y-1">
                     {friends.map(friend => (
                         <button key={friend._id} onClick={() => onSelectChat(friend)} className="w-full text-left flex items-center p-2 rounded-lg hover:bg-indigo-50 transition-colors">
                            <MessageSquare size={18} className="mr-3 text-gray-400" />
                            {friend.username}
                         </button>
                     ))}
                 </div>
            </div>
        </aside>
    );
}