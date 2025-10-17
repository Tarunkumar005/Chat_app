'use client';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, LogIn } from 'lucide-react';

const AuthForm = ({ isRegister, onSubmit, errorMessage }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(username, password);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full"
        >
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
                {isRegister ? 'Create Account' : 'Welcome Back'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="w-full px-4 py-3 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full px-4 py-3 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                />
                {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
                <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all duration-300"
                >
                    {isRegister ? 'Register' : 'Login'}
                </button>
            </form>
        </motion.div>
    );
};

export default function AuthPage() {
    const [isRegister, setIsRegister] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const { login, register } = useAuth();

    const handleLogin = async (username, password) => {
        const result = await login(username, password);
        if (!result.success) setErrorMessage(result.message);
    };

    const handleRegister = async (username, password) => {
        const result = await register(username, password);
        if (result.success) {
            setIsRegister(false);
            setErrorMessage('');
            alert('Registration successful! Please log in.');
        } else {
            setErrorMessage(result.message);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg">
                <AnimatePresence mode="wait">
                    {isRegister ? (
                        <AuthForm key="register" isRegister onSubmit={handleRegister} errorMessage={errorMessage} />
                    ) : (
                        <AuthForm key="login" onSubmit={handleLogin} errorMessage={errorMessage} />
                    )}
                </AnimatePresence>
                <div className="text-center">
                    <button onClick={() => { setIsRegister(!isRegister); setErrorMessage(''); }} className="text-indigo-600 hover:underline">
                        {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}