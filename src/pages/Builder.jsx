// src/pages/Builder.jsx
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { useBuilderStore } from "../store/builderStore";
import SlotBoard from "../components/SlotBoard";
import Toast from "../components/Toast";

// ===== Заполнение слотов по готовым паттернам =====

// если в документе коробки есть order:[индексы], используем его.
// иначе строим порядок по shape/capacity и геометрии.
function getFillOrder(box) {
    const n = box?.slotMap?.length || 0;
    const idx = Array.from({ length: n }, (_, i) => i);

    // Явный порядок из Firestore (если когда-нибудь добавишь)
    if (Array.isArray(box.order) && box.order.length) {
        return box.order.filter((i) => i >= 0 && i < n);
    }

    // Помощники сортировки
    const byYThenX = (a, b) =>
        (box.slotMap[a].y - box.slotMap[b].y) || (box.slotMap[a].x - box.slotMap[b].x);
    const byXThenY = (a, b) =>
        (box.slotMap[a].x - box.slotMap[b].x) || (box.slotMap[a].y - box.slotMap[b].y);

    // Для круга — по окружности по часовой, старт сверху
    const byAngleClockwise = (a, b) => {
        const cx = 0.5, cy = 0.5; // slotMap в нормализованных координатах
        const ax = box.slotMap[a].x - cx;
        const ay = box.slotMap[a].y - cy;
        const bx = box.slotMap[b].x - cx;
        const by = box.slotMap[b].y - cy;
        // угол от вертикали вверх (−π/2) по часовой
        const angA = ((Math.atan2(ay, ax) - (-Math.PI / 2) + 2 * Math.PI) % (2 * Math.PI));
        const angB = ((Math.atan2(by, bx) - (-Math.PI / 2) + 2 * Math.PI) % (2 * Math.PI));
        return angA - angB;
    };

    // «высокая» прямоугольная (высота ≫ ширины) — заполняем СВЕРХУ ВНИЗ
    const ratio = box?.inner ? box.inner.h / box.inner.w : 1;
    const isTallRect = box.shape === "rect" && ratio > 1.35;

    // Готовые паттерны:
    if (box.shape === "round" && (box.capacity === 8 || box.capacity === 12)) {
        return idx.sort(byAngleClockwise);
    }
    if (box.shape === "rect" && isTallRect) {
        // для твоего «вертикального» бокса на 6: сверху вниз, слева направо
        return idx.sort(byYThenX);
    }
    if (box.shape === "rect" && (box.capacity === 6 || box.capacity === 12)) {
        // классический прямоугольник: рядами слева направо, сверху вниз
        return idx.sort(byYThenX);
    }
    if (box.shape === "heart" && box.capacity === 12) {
        // сердце — тоже по рядам сверху вниз (зигзаг необязателен)
        return idx.sort(byYThenX);
    }

    // дефолт: по рядам
    return idx.sort(byYThenX);
}

// выбираем первый свободный слот по рассчитанному порядку
function chooseNextSlot(box, items) {
    const used = new Set(items.map((it) => it.slot));
    const order = getFillOrder(box);
    const free = order.find((i) => !used.has(i));
    return free ?? -1;
}

export default function Builder() {
    const [boxes, setBoxes] = useState([]);
    const [macarons, setMacarons] = useState([]);
    const [filter, setFilter] = useState("all");
    const [orderCreated, setOrderCreated] = useState(null);
    const [toast, setToast] = useState(null);

    const { selectedBox, setSelectedBox, items } = useBuilderStore();

    useEffect(() => {
        const loadBoxes = async () => {
            const snap = await getDocs(collection(db, "boxes"));
            setBoxes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        };
        const loadMacs = async () => {
            const snap = await getDocs(collection(db, "macarons"));
            setMacarons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        };
        loadBoxes();
        loadMacs();
    }, []);

    const calcTotal = () => {
        let total = 0;
        if (selectedBox) total += Number(selectedBox.price) || 0;
        for (const it of items) {
            const m = macarons.find((mm) => mm.id === it.macaronId);
            if (m) total += Number(m.price) || 0;
        }

        return total;
    };

    const clearOrder = () => {
        setSelectedBox(null);
        setToast({ message: "Заказ очищен", type: "info" });
    };

    const saveOrder = async (status) => {
        if (!selectedBox) {
            setToast({ message: "Сначала выберите коробку", type: "error" });
            return;
        }
        const order = {
            boxId: selectedBox.id,
            items: items.map((it) => ({
                slot: it.slot,
                macaronId: it.macaronId,
            })),
            extras: [],
            total: calcTotal(),
            status,
            createdAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, "orders"), order);
        setOrderCreated(ref.id);
        setToast({ message: "Заказ сохранён", type: "success" });
    };

    // Если заказ создан
    if (orderCreated) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="bg-white p-6 rounded-xl shadow text-center">
                    <h1 className="text-2xl font-bold mb-4">Заказ создан!</h1>
                    <p className="mb-4">Номер заказа: {orderCreated}</p>
                    <button
                        onClick={() => {
                            setOrderCreated(null);
                            setSelectedBox(null);
                        }}
                        className="bg-blue-500 text-white px-4 py-2 rounded"
                    >
                        Создать новый
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:grid md:grid-cols-3 gap-4 min-h-screen p-4 relative">
            {/* Левая колонка */}
            <div className="bg-white rounded-xl shadow p-4 overflow-x-auto md:overflow-visible">
                {/* Коробки */}
                <h2 className="font-bold mb-2">Выберите коробку</h2>
                {boxes.length === 0 && (
                    <p className="text-gray-400 mb-4">Нет доступных коробок</p>
                )}
                <div className="flex space-x-4 overflow-x-auto pb-2 mb-4">
                    {boxes.map((box) => (
                        <div
                            key={box.id}
                            onClick={() => {
                                setSelectedBox(box);
                                setToast({ message: "Коробка выбрана", type: "info" });
                            }}
                            className={`cursor-pointer flex-shrink-0 rounded-xl border p-2 flex items-center gap-3 w-56 
        ${selectedBox?.id === box.id ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
                        >
                            {box.imageUrl && (
                                <img
                                    src={box.imageUrl}
                                    alt="box"
                                    className="w-12 h-12 object-contain"
                                />
                            )}
                            <div className="flex flex-col">
                                <span className="font-semibold text-sm">{box.name}</span>
                                <span className="text-xs text-gray-600">{box.capacity} шт · {box.price} ₸</span>
                            </div>
                        </div>
                    ))}
                </div>



                {/* Каталог макаронсов */}
                <h2 className="font-bold mb-2">Каталог макаронс</h2>
                {macarons.length === 0 && (
                    <p className="text-gray-400 mb-4">Нет доступных макаронсов</p>
                )}
                <div className="flex space-x-2 mb-2">
                    <button onClick={() => setFilter("all")} className="px-2 py-1 border rounded">
                        Все
                    </button>
                    <button onClick={() => setFilter("popular")} className="px-2 py-1 border rounded">
                        Популярные
                    </button>
                    <button onClick={() => setFilter("inStock")} className="px-2 py-1 border rounded">
                        В наличии
                    </button>
                </div>
                <div className="flex space-x-4 overflow-x-auto pb-2">
                    {macarons
                        .filter((m) =>
                            filter === "all"
                                ? true
                                : filter === "popular"
                                    ? m.popular
                                    : filter === "inStock"
                                        ? m.inStock
                                        : true
                        )
                        .map((m) => (
                            <div
                                key={m.id}
                                className="relative flex-shrink-0 w-32 h-32 rounded-xl shadow cursor-pointer transition-transform duration-200 hover:scale-105"
                            >
                                {m.imageUrl && (
                                    <img
                                        src={m.imageUrl}
                                        alt={m.name}
                                        className="w-full h-full object-contain rounded-xl"
                                    />
                                )}
                                <button
                                    disabled={!m.inStock || !selectedBox}
                                    onClick={() => {
                                        if (!selectedBox) {
                                            setToast({ message: "Сначала выберите коробку", type: "error" });
                                            return;
                                        }
                                        if (items.length >= selectedBox.capacity) {
                                            setToast({
                                                message: `Коробка заполнена (${selectedBox.capacity} шт.)`,
                                                type: "error",
                                            });
                                            return;
                                        }
                                        const freeSlot = chooseNextSlot(selectedBox, items);
                                        if (freeSlot >= 0) {
                                            useBuilderStore.getState().addItem(freeSlot, m);
                                            setToast({ message: `Добавлен макарон: ${m.name}`, type: "success" });
                                        }

                                    }}
                                    className={`absolute bottom-1 right-1 px-3 py-1 rounded-full shadow ${
                                        m.inStock ? "bg-blue-500 text-white" : "bg-gray-300 text-gray-500"
                                    }`}
                                >
                                    +
                                </button>
                            </div>
                        ))}
                </div>

            </div>

            {/* Центральная колонка */}
            <div className="bg-white rounded-xl shadow p-4 flex flex-col items-center justify-start">
                {selectedBox ? (
                    <div className="w-full">
                        <p className="font-bold mb-2">{selectedBox.name}</p>
                        <p className="mb-4">
                            Заполнено {items.length}/{selectedBox.capacity}
                        </p>
                        <SlotBoard macarons={macarons} />
                    </div>
                ) : (
                    <p className="text-gray-500">[Выберите коробку]</p>
                )}
            </div>

            {/* Правая колонка (чек) */}
            <div className="bg-white rounded-xl shadow p-4 flex flex-col justify-between
    md:static md:block
    md:col-span-1
    w-full">
                <div>
                    <h2 className="font-bold mb-2">Ваш заказ</h2>
                    <div className="text-gray-700 mb-4">
                        Коробка: {selectedBox ? selectedBox.name : "—"}
                    </div>
                    <div className="text-gray-700 mb-4">Итого: {calcTotal()} ₸</div>
                </div>
                <div className="flex flex-col space-y-2">
                    <button onClick={clearOrder} className="bg-gray-300 px-4 py-2 rounded">
                        Очистить
                    </button>
                    <button
                        onClick={() => saveOrder("draft")}
                        className="bg-yellow-500 text-white px-4 py-2 rounded"
                    >
                        Сохранить как черновик
                    </button>
                    <button
                        onClick={() => saveOrder("paid")}
                        className="bg-green-500 text-white px-4 py-2 rounded"
                    >
                        Оформить заказ
                    </button>
                </div>
            </div>


            {/* Toast */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}
