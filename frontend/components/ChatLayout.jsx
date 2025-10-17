'use client';
import { useState } from 'react';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatLayout() {
    const [selectedChat, setSelectedChat] = useState(null);

    return (
        <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
            {/* --- Sidebar --- */}
            {/* ✨ On mobile, this div is hidden if a chat is selected. On desktop (md and up), it's always visible. */}
            <div className={`
                w-full h-full flex-shrink-0
                md:w-80 md:flex
                ${selectedChat ? 'hidden' : 'flex'}
            `}>
                <Sidebar onSelectChat={setSelectedChat} />
            </div>

            {/* --- Main Chat Area --- */}
            <main className="flex-1 flex flex-col">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={selectedChat ? selectedChat._id : 'empty'}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="h-full"
                    >
                        {selectedChat ? (
                            <ChatWindow 
                                chatUser={selectedChat} 
                                onBack={() => setSelectedChat(null)} // Pass function to go back
                            />
                        ) : (
                            // ✨ This welcome message is hidden on mobile, but visible on desktop.
                            <div className="hidden md:flex h-full items-center justify-center bg-gray-200">
                                <div className="text-center text-gray-500">
                                    <h2 className="text-2xl font-semibold">Welcome to the Chat</h2>
                                    <p>Select a friend from the sidebar to start chatting.</p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}