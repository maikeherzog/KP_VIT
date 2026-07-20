import { useEffect, useRef, useState } from "react";

const Chat = ({ isOpen = false, onOpenChange = () => {} }) => {

    const [message, setMessage] = useState("");

    const [messages, setMessages] = useState([]);

    const [isListening, setIsListening] = useState(false);

    const recognitionRef = useRef(null);

    const SpeechRecognitionAPI =
        typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition);
    const isSpeechSupported = Boolean(SpeechRecognitionAPI);

    useEffect(() => {
        if (!isSpeechSupported) return;

        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "de-DE";

        recognition.onresult = (event) => {
            let finalChunk = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalChunk += event.results[i][0].transcript;
                }
            }
            if (finalChunk) {
                setMessage((prev) => (prev ? `${prev} ${finalChunk}` : finalChunk).trim());
            }
        };

        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);

        recognitionRef.current = recognition;

        return () => recognition.stop();
    }, [isSpeechSupported]);

    function toggleListening() {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            recognitionRef.current.start();
            setIsListening(true);
        }
    }

    async function sendMessage() {

        if (!message.trim()) return;

        const userMessage = {
            sender: "user",
            text: message,
        };

        setMessages((prev) => [...prev, userMessage]);

        const currentMessage = message;

        setMessage("");

        try {

            const response = await fetch(`${import.meta.env.VITE_LLM_URL ?? "http://localhost:3000"}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: currentMessage,
                }),
            });

            const data = await response.json();

            const botMessage = {
                sender: "bot",
                text: data.reply,
            };

            const messageSound = new SpeechSynthesisUtterance(data.reply);
            speechSynthesis.speak(messageSound);

            setMessages((prev) => [...prev, botMessage]);

        } catch (error) {

            console.error(error);

            setMessages((prev) => [
                ...prev,
                {
                    sender: "bot",
                    text: "Failed to connect to AI server.",
                },
            ]);
        }
    }

    return (
        <>
            <button
                onClick={() => onOpenChange(!isOpen)}
                className="
                    fixed
                    bottom-6
                    right-6
                    w-14
                    h-14
                    rounded-full
                    bg-slate-800
                    text-white
                    text-2xl
                    shadow-xl
                    hover:bg-slate-700
                    transition
                    duration-300
                    z-50
                "
            >
                💬
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div
                    className="
                        fixed
                        bottom-24
                        right-6
                        w-96
                        h-[500px]
                        bg-slate-950
                        rounded-2xl
                        shadow-2xl
                        flex
                        flex-col
                        overflow-hidden
                        border border-slate-700
                        z-50
                    "
                >

                    {/* Header */}
                    <div
                        className="
                            bg-slate-900
                            border-b
                            border-slate-700
                            text-slate-100
                            p-4
                            text-lg
                            font-semibold
                            flex
                            justify-between
                            items-center
                        "
                    >
                        <span>AI Navigator</span>

                        <button
                            onClick={() => onOpenChange(false)}
                            className="text-slate-200 text-xl hover:text-white transition"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Messages */}
                    <div
                        className="
                            flex-1
                            p-4
                            overflow-y-auto
                            bg-slate-950
                            text-slate-100
                            space-y-3
                        "
                    >

                        {messages.map((msg, index) => (

                            <div
                                key={index}
                                className={`
                                    max-w-[80%]
                                    px-4
                                    py-3
                                    rounded-2xl
                                    text-sm
                                    whitespace-pre-wrap
                                    ${
                                    msg.sender === "user"
                                        ? "ml-auto bg-indigo-600 text-white shadow-lg"
                                        : "mr-auto bg-slate-100 text-slate-900 shadow"
                                }
                                `}
                            >
                                {msg.text}
                            </div>
                        ))}
                    </div>

                    {/* Input Area */}
                    <div
                        className="
                            p-4
                            border-t
                            border-slate-700
                            flex
                            gap-2
                            bg-slate-950
                        "
                    >
                        <input
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    sendMessage();
                                }
                            }}
                            placeholder="Type your message..."
                            className="
                                flex-1
                                border
                                border-slate-700
                                rounded-xl
                                px-4
                                py-2
                                outline-none
                                focus:ring-2
                                focus:ring-slate-500
                                bg-slate-900
                                text-slate-100
                                placeholder-slate-500
                            "
                        />

                        {isSpeechSupported && (
                            <button
                                onClick={toggleListening}
                                title={isListening ? "Aufnahme stoppen" : "Spracheingabe starten"}
                                className={`
                                    px-4
                                    rounded-xl
                                    transition
                                    ${isListening
                                        ? "bg-red-500 text-white animate-pulse"
                                        : "bg-slate-700 text-slate-100 hover:bg-slate-600"}
                                `}
                            >
                                {isListening ? "⏹" : "🎤"}
                            </button>
                        )}

                        <button
                            onClick={sendMessage}
                            className="
                                bg-indigo-600
                                text-white
                                px-5
                                rounded-xl
                                hover:bg-indigo-500
                                transition
                            "
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export default Chat;