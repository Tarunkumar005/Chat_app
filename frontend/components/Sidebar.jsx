'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Search, X, Check, LogOut, MessageSquare, UserX } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Sidebar({ onSelectChat }) {
    const { user, logout, socket } = useAuth();
    const [friends, setFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchError, setSearchError] = useState('');

    const getApi = useCallback(() => {
        if (!user?.id) return null;
        return axios.create({
            headers: { 'x-user-id': user.id }
        });
    }, [user]);

    const fetchUserData = useCallback(async () => {
        const api = getApi();
        if (!api) return;
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
    }, [getApi]);

    useEffect(() => {
        if (!socket || !user) return;
        
        fetchUserData();

        const handleNewFriendRequest = () => fetchUserData();
        const handleRequestAccepted = () => fetchUserData();
        const handleFriendRemoved = ({ removedById }) => {
            onSelectChat(current => (current?._id === removedById ? null : current));
            fetchUserData();
        };

        socket.on('new_friend_request', handleNewFriendRequest);
        socket.on('request_accepted', handleRequestAccepted);
        socket.on('friend_removed', handleFriendRemoved);
        
        return () => {
            socket.off('new_friend_request', handleNewFriendRequest);
            socket.off('request_accepted', handleRequestAccepted);
            socket.off('friend_removed', handleFriendRemoved);
        };
    }, [user, socket, fetchUserData, onSelectChat]);

    useEffect(() => {
        if (searchTerm.length > 1) {
            const api = getApi();
            if (!api) return;
            const delayDebounceFn = setTimeout(async () => {
                const { data } = await api.get(`${API_URL}/api/users?term=${searchTerm}`);
                setSearchResults(data);
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setSearchResults([]);
        }
    }, [searchTerm, getApi]);
    
    const sendFriendRequest = async (recipientId) => {
        const api = getApi();
        if (!api) return;
        try {
            setSearchError('');
            await api.post(`${API_URL}/api/friend-requests/send`, { senderId: user.id, recipientId });
            setSearchTerm('');
        } catch (error) {
            setSearchError(error.response?.data?.message || 'Failed to send request.');
            setTimeout(() => setSearchError(''), 4000);
        }
    };

    const handleRequest = async (requestId, action) => {
        const api = getApi();
        if (!api) return;
        const url = `${API_URL}/api/friend-requests/${requestId}/${action}`;
        await api.post(url);
        fetchUserData();
    };

    const handleRemoveFriend = async (friendId) => {
        const api = getApi();
        if (!api) return;
        if (window.confirm('Are you sure you want to remove this friend? This will also delete your entire conversation.')) {
            try {
                setFriends(prev => prev.filter(f => f._id !== friendId));
                onSelectChat(current => (current?._id === friendId ? null : current));
                await api.post(`${API_URL}/api/friends/remove`, { friendId });
            } catch (error) {
                console.error("Failed to remove friend", error);
                fetchUserData();
            }
        }
    };

    return (
        <aside className="w-full bg-white border-r border-gray-200 flex flex-col h-full">
            <header className="p-4 border-b flex justify-between items-center flex-shrink-0">
                <h1 className="text-xl font-bold text-gray-800">{user?.username}</h1>
                <button onClick={logout} className="p-2 text-gray-500 hover:text-red-500 rounded-full hover:bg-gray-100 transition-colors">
                    <LogOut size={20} />
                </button>
            </header>
            
            <div className="p-4 border-b flex-shrink-0">
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Find friends..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                {searchError && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-500 mt-2">{searchError}</motion.p>}
                <AnimatePresence>
                {searchResults.length > 0 && (
                    <motion.div initial={{opacity: 0, height: 0}} animate={{opacity: 1, height: 'auto'}} exit={{opacity: 0, height: 0}} className="mt-2 bg-white rounded-lg shadow-md overflow-hidden">
                        {searchResults.map(foundUser => (
                            <div key={foundUser._id} className="p-2 flex justify-between items-center hover:bg-gray-50">
                                <span>{foundUser.username}</span>
                                <button onClick={() => sendFriendRequest(foundUser._id)} className="p-1 text-indigo-500 hover:bg-indigo-100 rounded-full"><UserPlus size={18} /></button>
                            </div>
                        ))}
                    </motion.div>
                )}
                </AnimatePresence>
            </div>
            
            <div className="p-4 border-b flex-shrink-0">
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

            <div className="flex-1 p-4 overflow-y-auto">
                 <h2 className="text-sm font-semibold text-gray-500 mb-2">Friends ({friends.length})</h2>
                 <div className="space-y-1">
                     <AnimatePresence>
                     {friends.map(friend => (
                         <motion.div key={friend._id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="group flex items-center justify-between w-full text-left p-2 rounded-lg hover:bg-indigo-50 transition-colors">
                            <button onClick={() => onSelectChat(friend)} className="flex items-center flex-grow truncate">
                                <MessageSquare size={18} className="mr-3 text-gray-400 flex-shrink-0" />
                                <span className="truncate">{friend.username}</span>
                            </button>
                            <button onClick={() => handleRemoveFriend(friend._id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-full transition-opacity" title="Remove friend">
                                <UserX size={16} />
                            </button>
                         </motion.div>
                     ))}
                     </AnimatePresence>
                 </div>
            </div>
        </aside>
    );
}