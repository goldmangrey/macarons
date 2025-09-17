// src/pages/Moderator/Dashboard.jsx
import { useState, useEffect } from "react";
import { db, storage } from "../../firebase";

import {
    getDoc,
    query,
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import PasswordChanger from "../../components/PasswordChanger";

// ===== FIXED BOX TEMPLATES (editable only by dev) =====
// ===== FIXED BOX TEMPLATES tuned for your PNGs =====
// slotMap: координаты нормированы внутри inner (0..1)
const BOX_TEMPLATES = {
    // КВАДРАТ 12 шт — сетка 3×4
    rect12_square: {
        label: "Квадрат • 12 (3×4)",
        shape: "rect",
        capacity: 12,
        // рабочая область внутри PNG (внутренний «ложемент»)
        inner: { x: 0.125, y: 0.125, w: 0.75, h: 0.75 },
        // размер кружка как % ширины контейнера (под твой 768×768)
        slotSize: 16,
        // 3 ряда × 4 колонки (по рядам сверху вниз, слева направо)
        slotMap: [
            { x: 0.20, y: 0.22 }, { x: 0.40, y: 0.22 }, { x: 0.60, y: 0.22 }, { x: 0.80, y: 0.22 },
            { x: 0.20, y: 0.50 }, { x: 0.40, y: 0.50 }, { x: 0.60, y: 0.50 }, { x: 0.80, y: 0.50 },
            { x: 0.20, y: 0.78 }, { x: 0.40, y: 0.78 }, { x: 0.60, y: 0.78 }, { x: 0.80, y: 0.78 },
        ],
        // порядок (по индексам slotMap), чтобы билось с заполнялкой
        order: [0,1,2,3,4,5,6,7,8,9,10,11],
    },

    // ВЫСОКИЙ ПРЯМОУГОЛЬНИК 6 шт — один столбец 1×6 по центру, сверху вниз
    rect6_tall: {
        label: "Прямоугольная высокая • 6 (1×6)",
        shape: "rect",
        capacity: 6,
        // под PNG 768×1152: узкая центральная полоса
        inner: { x: 0.36, y: 0.11, w: 0.28, h: 0.78 },
        slotSize: 20, // ширина макаронса ≈ ширине «ложемента»
        // x = центр, y равномерно сверху вниз
        slotMap: [
            { x: 0.50, y: 0.15 },
            { x: 0.50, y: 0.28 },
            { x: 0.50, y: 0.41 },
            { x: 0.50, y: 0.54 },
            { x: 0.50, y: 0.67 },
            { x: 0.50, y: 0.80 },
        ],
        order: [0,1,2,3,4,5], // строго сверху вниз
    },

    // КРУГ 12 шт — идеальное кольцо, старт сверху, по часовой
    round9_ring: {
        label: "Круг • 9 (кольцо)",
        shape: "round",
        capacity: 9,
        inner: { x: 0.18, y: 0.18, w: 0.64, h: 0.64 }, // уменьшили радиус (ближе к центру)
        slotSize: 18,
        // 9 точек равномерно по окружности (каждые 40°)
        slotMap: Array.from({ length: 9 }, (_, i) => {
            const angle = (i / 9) * 2 * Math.PI - Math.PI / 2; // старт сверху
            return {
                x: 0.5 + 0.38 * Math.cos(angle), // радиус уменьшен с 0.45 → 0.38
                y: 0.5 + 0.38 * Math.sin(angle),
            };
        }),
        order: [0,1,2,3,4,5,6,7,8],
    },

};


// Найти подходящий ключ шаблона по shape+capacity (если в коробке нет templateKey)
const resolveTemplateKey = (box) => {
    if (box.templateKey && BOX_TEMPLATES[box.templateKey]) return box.templateKey;
    const found = Object.entries(BOX_TEMPLATES).find(
        ([, t]) => t.shape === box.shape && t.capacity === Number(box.capacity)
    );
    return found ? found[0] : null;
};

// Перезаписать поля коробки из шаблона
const buildPayloadFromTemplate = (tpl, box) => ({
    name: box?.name || tpl.label,
    shape: tpl.shape,
    capacity: tpl.capacity,
    price: Number(box?.price ?? 0),
    imageUrl: box?.imageUrl || "",
    active: typeof box?.active === "boolean" ? box.active : true,
    slotMap: tpl.slotMap,
    inner: tpl.inner || { x: 0, y: 0, w: 1, h: 1 },
    slotSize: tpl.slotSize || null,
    order: Array.isArray(tpl.order) ? tpl.order : [],
    templateKey: box?.templateKey || Object.keys(BOX_TEMPLATES).find((k) => BOX_TEMPLATES[k] === tpl),
});

export default function Dashboard() {
    const [tab, setTab] = useState("boxes");

    // ------------------- BOXES -------------------
    const [boxes, setBoxes] = useState([]);
// дефолтный шаблон
    const DEFAULT_TPL_KEY = "rect12_square";
    const DEFAULT_TPL = BOX_TEMPLATES[DEFAULT_TPL_KEY];

    const [newBox, setNewBox] = useState({
        templateKey: DEFAULT_TPL_KEY,
        name: "",
        shape: DEFAULT_TPL.shape,
        capacity: DEFAULT_TPL.capacity,
        price: 0,
        imageUrl: "",
    });

    const [file, setFile] = useState(null);
    const [editBoxId, setEditBoxId] = useState(null);

    const loadBoxes = async () => {
        const snap = await getDocs(collection(db, "boxes"));
        setBoxes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };

    useEffect(() => {
        loadBoxes();
    }, []);

    // 🔹 внутри Dashboard.jsx
    const addOrUpdateBox = async () => {
        try {
            // 1) берём выбранный шаблон
            const tpl = BOX_TEMPLATES[newBox.templateKey];
            if (!tpl) {
                alert("Не выбран корректный шаблон коробки");
                return;
            }

            // 2) загрузка PNG (если выбран новый файл)
            let imageUrl = newBox.imageUrl || "";
            if (file) {
                const storageRef = ref(storage, `boxes/${Date.now()}-${file.name}`);
                await uploadBytes(storageRef, file);
                imageUrl = await getDownloadURL(storageRef);
            }

            // 3) собираем финальные данные коробки: shape/capacity/slotMap — только из шаблона
            const payload = {
                name: newBox.name || tpl.label,
                shape: tpl.shape,
                capacity: tpl.capacity,
                price: Number(newBox.price) || 0,
                imageUrl,
                active: true,
                slotMap: tpl.slotMap,
                inner: tpl.inner || { x: 0, y: 0, w: 1, h: 1 },
                slotSize: tpl.slotSize || null,
                order: Array.isArray(tpl.order) ? tpl.order : [],
                templateKey: newBox.templateKey, // ← добавь это
            };





            if (editBoxId) {
                await updateDoc(doc(db, "boxes", editBoxId), payload);
                alert("Коробка обновлена");
            } else {
                await addDoc(collection(db, "boxes"), payload);
                alert("Коробка добавлена");
            }

            // 4) сброс формы
            setNewBox({
                templateKey: "rect6",
                name: "",
                shape: BOX_TEMPLATES["rect6"].shape,
                capacity: BOX_TEMPLATES["rect6"].capacity,
                price: 0,
                imageUrl: "",
            });
            setFile(null);
            setEditBoxId(null);
            loadBoxes();
        } catch (e) {
            console.error(e);
            alert("Ошибка при сохранении коробки");
        }
    };



    const editBox = (box) => {
        const key = box.templateKey || resolveTemplateKey(box) || DEFAULT_TPL_KEY;
        setEditBoxId(box.id);
        setNewBox({
            templateKey: key,
            name: box.name || "",
            shape: BOX_TEMPLATES[key].shape,
            capacity: BOX_TEMPLATES[key].capacity,
            price: Number(box.price) || 0,
            imageUrl: box.imageUrl || "",
        });
    };





    const deleteBox = async (box) => {
        if (!window.confirm("Удалить коробку?")) return;
        await deleteDoc(doc(db, "boxes", box.id));
        if (box.imageUrl) {
            try {
                const imgRef = ref(storage, box.imageUrl);
                await deleteObject(imgRef);
            } catch (e) {
                console.warn("Не удалось удалить файл из Storage", e);
            }
        }
        loadBoxes();
    };

    // ------------------- MACARONS -------------------
    const [macarons, setMacarons] = useState([]);
    const [newMac, setNewMac] = useState({ name: "", colorHex: "#ffffff", price: 0 });
    const [macFile, setMacFile] = useState(null);
    const [editMacId, setEditMacId] = useState(null);

    const loadMacs = async () => {
        const snap = await getDocs(collection(db, "macarons"));
        setMacarons(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };

    useEffect(() => {
        loadMacs();
    }, []);

    const addOrUpdateMacaron = async () => {
        let imageUrl = "";
        if (macFile) {
            const storageRef = ref(storage, `macarons/${Date.now()}-${macFile.name}`);
            await uploadBytes(storageRef, macFile);
            imageUrl = await getDownloadURL(storageRef);
        }

        if (editMacId) {
            const refDoc = doc(db, "macarons", editMacId);
            await updateDoc(refDoc, {
                ...newMac,
                ...(imageUrl && { imageUrl }),
            });
            alert("Макарон обновлён");
        } else {
            await addDoc(collection(db, "macarons"), {
                ...newMac,
                imageUrl,
                inStock: true,
                popular: false,
            });
            alert("Макарон добавлен");
        }

        setNewMac({ name: "", colorHex: "#ffffff", price: 0 });
        setMacFile(null);
        setEditMacId(null);
        loadMacs();
    };

    const editMac = (mac) => {
        setEditMacId(mac.id);
        setNewMac({
            name: mac.name,
            colorHex: mac.colorHex,
            price: mac.price,
            imageUrl: mac.imageUrl || "",
        });
    };


    const deleteMac = async (mac) => {
        if (!window.confirm("Удалить макарон?")) return;
        await deleteDoc(doc(db, "macarons", mac.id));
        if (mac.imageUrl) {
            try {
                const imgRef = ref(storage, mac.imageUrl);
                await deleteObject(imgRef);
            } catch (e) {
                console.warn("Не удалось удалить файл из Storage", e);
            }
        }
        loadMacs();
    };
    const [oldPass, setOldPass] = useState("");
    const [newPass, setNewPass] = useState("");

    const changePassword = async () => {
        const ref = doc(db, "config", "moderator");
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            alert("Документ config/moderator не найден!");
            return;
        }
        const current = snap.data().password;
        if (current !== oldPass) {
            alert("Старый пароль неверный");
            return;
        }
        await updateDoc(ref, {
            password: newPass,
            updatedAt: new Date().toISOString(),
        });
        alert("Пароль успешно обновлён!");
        setOldPass("");
        setNewPass("");
    };
    // ------------------- RENDER -------------------
    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold mb-4">Модератор</h2>

            <div className="flex gap-4">
                {/* Навигация вкладок */}
                <div className="flex flex-col gap-2">
                    <button
                        className={`px-4 py-2 rounded ${tab === "boxes" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        onClick={() => setTab("boxes")}
                    >
                        Коробки
                    </button>
                    <button
                        className={`px-4 py-2 rounded ${tab === "macarons" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        onClick={() => setTab("macarons")}
                    >
                        Макаронс
                    </button>
                    <button
                        className={`px-4 py-2 rounded ${tab === "password" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
                        onClick={() => setTab("password")}
                    >
                        Сменить пароль
                    </button>

                </div>

                {/* Контент вкладок */}
                <div className="flex-1">
                    {tab === "boxes" && (
                        <div>
                            <h3 className="text-xl font-semibold mb-4">Управление коробками</h3>

                            {/* Сервисные действия для коробок */}
                            <div className="flex items-center gap-2 mb-3">
                                <button
                                    onClick={async () => {
                                        // Пересобрать ВСЕ коробки по шаблонам
                                        const snap = await getDocs(query(collection(db, "boxes")));
                                        let ok = 0, skip = 0, miss = 0;
                                        for (const d of snap.docs) {
                                            const box = { id: d.id, ...d.data() };
                                            const key = resolveTemplateKey(box);
                                            if (!key) { miss++; continue; }
                                            const tpl = BOX_TEMPLATES[key];
                                            if (!tpl) { miss++; continue; }
                                            const payload = buildPayloadFromTemplate(tpl, box);
                                            await updateDoc(doc(db, "boxes", box.id), payload);
                                            ok++;
                                        }
                                        alert(`Готово!\nОбновлено: ${ok}\nПропущено (нет шаблона): ${miss}\nОстались без изменений: ${skip}`);
                                        loadBoxes && loadBoxes();
                                    }}
                                    className="px-3 py-2 rounded bg-blue-600 text-white"
                                >
                                    Пересобрать паттерны по шаблонам
                                </button>

                                <button
                                    onClick={async () => {
                                        // Только для выделенной коробки
                                        if (!editBoxId) { alert("Сначала выберите коробку для редактирования"); return; }
                                        const ref = doc(db, "boxes", editBoxId);
                                        const key = newBox?.templateKey;
                                        const tpl = key ? BOX_TEMPLATES[key] : null;
                                        if (!tpl) { alert("Шаблон не выбран или не найден"); return; }
                                        const payload = buildPayloadFromTemplate(tpl, { ...newBox, id: editBoxId });
                                        await updateDoc(ref, payload);
                                        alert("Паттерн обновлён для выбранной коробки");
                                        loadBoxes && loadBoxes();
                                    }}
                                    className="px-3 py-2 rounded bg-slate-600 text-white"
                                >
                                    Пересобрать выбранную
                                </button>
                            </div>

                            {/* Форма добавления/редактирования коробки */}
                            <div className="mb-6">
                                <select
                                    className="border p-2 w-full mb-3"
                                    value={newBox.templateKey}
                                    onChange={(e) => {
                                        const key = e.target.value;
                                        const tpl = BOX_TEMPLATES[key];
                                        setNewBox((prev) => ({
                                            ...prev,
                                            templateKey: key,
                                            shape: tpl.shape,
                                            capacity: tpl.capacity,
                                        }));
                                    }}
                                >
                                    {Object.entries(BOX_TEMPLATES).map(([key, tpl]) => (
                                        <option key={key} value={key}>{tpl.label}</option>
                                    ))}
                                </select>

                                <input
                                    type="text"
                                    placeholder="Название коробки"
                                    className="border p-2 w-full mb-3"
                                    value={newBox.name}
                                    onChange={(e) => setNewBox({ ...newBox, name: e.target.value })}
                                />
                                <input
                                    type="number"
                                    placeholder="Цена"
                                    className="border p-2 w-full mb-3"
                                    value={newBox.price}
                                    onChange={(e) => setNewBox({ ...newBox, price: e.target.value })}
                                />
                                {/* Загрузка изображения в Firebase */}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="mb-3"
                                    onChange={async (e) => {
                                        const file = e.target.files[0];
                                        if (!file) return;
                                        const storageRef = ref(storage, `boxes/${Date.now()}-${file.name}`);
                                        await uploadBytes(storageRef, file);
                                        const url = await getDownloadURL(storageRef);
                                        setNewBox((prev) => ({ ...prev, imageUrl: url }));
                                    }}
                                />

                                {/* Превью + возможность вручную вставить URL */}
                                <input
                                    type="text"
                                    placeholder="URL изображения"
                                    className="border p-2 w-full mb-3"
                                    value={newBox.imageUrl}
                                    onChange={(e) => setNewBox({ ...newBox, imageUrl: e.target.value })}
                                />

                                {newBox.imageUrl && (
                                    <img
                                        src={newBox.imageUrl}
                                        alt="preview"
                                        className="h-24 object-contain mb-3"
                                    />
                                )}


                                <div className="flex gap-2">
                                    <button
                                        onClick={addOrUpdateBox}
                                        className="px-4 py-2 bg-green-600 text-white rounded"
                                    >
                                        {editBoxId ? "Обновить коробку" : "Добавить коробку"}
                                    </button>
                                    {editBoxId && (
                                        <button
                                            onClick={() => { setEditBoxId(null); setNewBox({ templateKey: "rect12_square", name: "", price: "", imageUrl: "" }); }}
                                            className="px-4 py-2 bg-gray-400 text-white rounded"
                                        >
                                            Отмена
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Список коробок */}
                            <div className="grid grid-cols-2 gap-4">
                                {boxes.map((box) => (
                                    <div key={box.id} className="border p-3 rounded shadow">
                                        <h4 className="font-semibold">{box.name}</h4>
                                        <p>Вместимость: {box.capacity}</p>
                                        <p>Цена: {box.price} ₸</p>
                                        {box.imageUrl && (
                                            <img src={box.imageUrl} alt={box.name} className="h-24 object-contain" />
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => editBox(box)}
                                                className="px-3 py-1 bg-yellow-500 text-white rounded"
                                            >
                                                Редактировать
                                            </button>
                                            <button
                                                onClick={() => deleteBox(box.id)}
                                                className="px-3 py-1 bg-red-500 text-white rounded"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === "macarons" && (
                        <div>
                            <h3 className="text-xl font-semibold mb-4">Управление макаронсами</h3>

                            {/* Форма добавления/редактирования макаронсов */}
                            <div className="mb-6">
                                <input
                                    type="text"
                                    placeholder="Название"
                                    className="border p-2 w-full mb-3"
                                    value={newMac.name}
                                    onChange={(e) => setNewMac({ ...newMac, name: e.target.value })}
                                />
                                <input
                                    type="color"
                                    className="border p-2 w-full mb-3"
                                    value={newMac.colorHex}
                                    onChange={(e) => setNewMac({ ...newMac, colorHex: e.target.value })}
                                />
                                <input
                                    type="number"
                                    placeholder="Цена"
                                    className="border p-2 w-full mb-3"
                                    value={newMac.price}
                                    onChange={(e) => setNewMac({ ...newMac, price: e.target.value })}
                                />

                                {/* Загрузка PNG в Firebase */}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="mb-3"
                                    onChange={(e) => setMacFile(e.target.files[0])}
                                />

                                {newMac.imageUrl && (
                                    <img src={newMac.imageUrl} alt="preview" className="h-24 object-contain mb-3" />
                                )}

                                <div className="flex gap-2">
                                    <button
                                        onClick={addOrUpdateMacaron}
                                        className="px-4 py-2 bg-green-600 text-white rounded"
                                    >
                                        {editMacId ? "Обновить макарон" : "Добавить макарон"}
                                    </button>
                                    {editMacId && (
                                        <button
                                            onClick={() => {
                                                setEditMacId(null);
                                                setNewMac({ name: "", colorHex: "#ffffff", price: 0 });
                                                setMacFile(null);
                                            }}
                                            className="px-4 py-2 bg-gray-400 text-white rounded"
                                        >
                                            Отмена
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Список макаронсов */}
                            <div className="grid grid-cols-2 gap-4">
                                {macarons.map((mac) => (
                                    <div key={mac.id} className="border p-3 rounded shadow">
                                        <h4 className="font-semibold">{mac.name}</h4>
                                        <p>Цена: {mac.price} ₸</p>
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-6 h-6 rounded-full"
                                                style={{ backgroundColor: mac.colorHex }}
                                            ></div>
                                            {/*<span>{mac.colorHex}</span>*/}
                                        </div>
                                        {mac.imageUrl && (
                                            <img src={mac.imageUrl} alt={mac.name} className="h-24 object-contain" />
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => editMac(mac)}
                                                className="px-3 py-1 bg-yellow-500 text-white rounded"
                                            >
                                                Редактировать
                                            </button>
                                            <button
                                                onClick={() => deleteMac(mac)}
                                                className="px-3 py-1 bg-red-500 text-white rounded"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}


                    {tab === "orders" && (
                        <div>
                            <h3 className="text-xl font-semibold mb-4">Управление заказами</h3>
                            {/* твой код для заказов */}
                        </div>
                    )}
                    {tab === "password" && (
                        <div>
                            <h3 className="text-xl font-semibold mb-4">Сменить пароль модератора</h3>
                            <input
                                type="password"
                                placeholder="Старый пароль"
                                className="border p-2 w-full mb-3"
                                value={oldPass}
                                onChange={(e) => setOldPass(e.target.value)}
                            />
                            <input
                                type="password"
                                placeholder="Новый пароль"
                                className="border p-2 w-full mb-3"
                                value={newPass}
                                onChange={(e) => setNewPass(e.target.value)}
                            />
                            <button
                                onClick={changePassword}
                                className="px-4 py-2 bg-green-600 text-white rounded"
                            >
                                Обновить пароль
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );

}
