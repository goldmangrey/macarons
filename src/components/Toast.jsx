// src/components/Toast.jsx
import { useEffect } from "react";

export default function Toast({ message, type = "info", onClose }) {
    const bg =
        type === "error"
            ? "bg-red-500"
            : type === "success"
                ? "bg-green-500"
                : "bg-blue-500";

    useEffect(() => {
        const timer = setTimeout(onClose, 2500);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div
            className={`${bg} text-white px-4 py-2 rounded shadow fixed bottom-4 right-4 z-50`}
        >
            {message}
        </div>
    );
}
