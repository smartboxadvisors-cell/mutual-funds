import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/login.module.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); // Clear previous errors
        
        // Basic validation
        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password');
            return;
        }

        try {
            const RAW_API_BASE = import.meta.env.VITE_API_URL || 'https://mutual-funds-kohl.vercel.app/api';
            const API_BASE = /\/api\/?$/.test(RAW_API_BASE)
                ? RAW_API_BASE.replace(/\/$/, '')
                : `${RAW_API_BASE.replace(/\/$/, '')}/api`;
            
            console.log('Attempting login to:', `${API_BASE}/auth/login`);
            
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email.trim(), password }),
            });

            // Handle non-JSON responses
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response. Check if backend is running.');
            }
            

            const data = await response.json();

            if (data.success) {
                // Store authentication token
                localStorage.setItem('token', data.token);
                console.log('Login successful, redirecting...');
                // Redirect to main page
                navigate('/');
            } else {
                setError(data.message || 'Invalid credentials');
            }
        } catch (err) {
            console.error('Login error:', err);
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                setError('Cannot connect to server. Please check if the backend is running.');
            } else {
                setError(err.message || 'An error occurred during login');
            }
        }
    };

    return (
        <div className={styles.loginContainer}>
            <form className={styles.loginForm} onSubmit={handleSubmit}>
                <h2>Login</h2>
                {error && <div className={styles.error}>{error}</div>}
                <div className={styles.formGroup}>
                    <label htmlFor="email">Email:</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className={styles.formGroup}>
                    <label htmlFor="password">Password:</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className={styles.loginButton}>
                    Login
                </button>
            </form>
        </div>
    );
};

export default Login;