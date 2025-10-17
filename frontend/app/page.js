'use client';
import { AuthProvider, useAuth } from '../context/AuthContext';
import AuthPage from '../components/AuthPage';
import ChatLayout from '../components/ChatLayout';

function Home() {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? <ChatLayout /> : <AuthPage />;
}

export default function Page() {
    return (
        <AuthProvider>
            <Home />
        </AuthProvider>
    );
}