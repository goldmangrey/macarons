// src/components/PasswordChanger.jsx
import { useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function PasswordChanger() {
    const [oldPass, setOldPass] = useState("");
    const [newPass, setNewPass] = useState("");
    const [message, setMessage] = useState("");

    const changePassword = async () => {
        try {
            const snap = await getDoc(doc(db, "config", "moderator"));
            if (!snap.exists()) {
                setMessage("Документ не найден");
                return;
            }
            const saved = snap.data().password;
            if (oldPass !== saved) {
                setMessage("Старый пароль неверен");
                return;
            }
            await updateDoc(doc(db, "config", "moderator"), {
                password: newPass,
                updatedAt: serverTimestamp(),
            });
            setMessage("Пароль успешно изменён");
            setOldPass("");
            setNewPass("");
        } catch (e) {
            console.error(e);
            setMessage("Ошибка при смене пароля");
        }
    };

    return (
        <div>
            <h2 className="font-bold mb-2">Сменить пароль</h2>
            <input
                type="password"
                placeholder="Старый пароль"
                className="border p-2 w-full mb-2"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
            />
            <input
                type="password"
                placeholder="Новый пароль"
                className="border p-2 w-full mb-2"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
            />
            <button
                onClick={changePassword}
                className="bg-blue-500 text-white px-4 py-2 rounded"
            >
                Сменить
            </button>
            {message && <p className="mt-2 text-sm">{message}</p>}
        </div>
    );
}
