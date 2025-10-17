'use client';
import { useState } from 'react';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import { motion } from 'framer-motion';

export default function ChatLayout() {
    const [selectedChat, setSelectedChat] = useState(null);

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <Sidebar onSelectChat={setSelectedChat} />
            <main className="flex-1 flex flex-col">
                <motion.div
                    // ✨ FIX: Changed selectedChat.id to selectedChat._id
                    key={selectedChat ? selectedChat._id : 'empty'}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="h-full"
                >
                    {selectedChat ? (
                        <ChatWindow chatUser={selectedChat} />
                    ) : (
                        <div className="flex h-full items-center justify-center bg-gray-200">
                            <div className="text-center text-gray-500">
                                <h2 className="text-2xl font-semibold">Welcome to the Chat</h2>
                                <p>Select a friend from the sidebar to start chatting.</p>
                            </div>
                        </div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}