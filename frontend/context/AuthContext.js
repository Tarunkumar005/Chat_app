'use client';
import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const AuthContext = createContext(null);
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('chatUser');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
        }
    }, []);

    useEffect(() => {
        if (user?.username) {
            const newSocket = io(API_URL, {
                auth: { username: user.username },
            });
            setSocket(newSocket);

            return () => {
                newSocket.disconnect();
            };
        }
    }, [user]);

    const login = async (username, password) => {
        try {
            const { data } = await axios.post(`${API_URL}/api/login`, { username, password });
            const userData = { username: data.user.username, id: data.user.id };
            localStorage.setItem('chatUser', JSON.stringify(userData));
            setUser(userData);
            return { success: true };
        } catch (error) {
            return { success: false, message: error.response?.data?.message || 'Login failed' };
        }
    };
    
    const register = async (username, password) => {
         try {
            await axios.post(`${API_URL}/api/register`, { username, password });
            return { success: true };
        } catch (error) {
            return { success: false, message: error.response?.data?.message || 'Registration failed' };
        }
    }

    const logout = () => {
        localStorage.removeItem('chatUser');
        setUser(null);
        if (socket) {
            socket.disconnect();
        }
    };

    return (
        <AuthContext.Provider value={{ user, socket, login, register, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);