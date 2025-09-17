// src/pages/Moderator/Login.jsx
import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function Login({ onLogin }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleLogin = async () => {
        try {
            const snap = await getDoc(doc(db, "config", "moderator"));
            if (!snap.exists()) {
                setError("Пароль не найден в базе");
                return;
            }
            const saved = snap.data().password;
            if (password === saved) {
                localStorage.setItem("mod_ok", "1");
                onLogin();
            } else {
                setError("Неверный пароль");
            }
        } catch (e) {
            console.error(e);
            setError("Ошибка подключения к Firestore");
        }
    };

    useEffect(() => {
        if (localStorage.getItem("mod_ok") === "1") {
            onLogin();
        }
    }, [onLogin]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-6 rounded-xl shadow w-80">
                <h1 className="text-xl font-bold mb-4">Модератор</h1>
                <input
                    type="password"
                    className="w-full border rounded px-3 py-2 mb-2"
                    placeholder="Введите пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                <button
                    onClick={handleLogin}
                    className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
                >
                    Войти
                </button>
            </div>
        </div>
    );
}
