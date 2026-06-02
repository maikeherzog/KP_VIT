import { useState } from "react";

const Chat = () => {

    const [isOpen, setIsOpen] = useState(false);

    const [message, setMessage] = useState("");

    const [messages, setMessages] = useState([]);

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

            const response = await fetch("http://localhost:3000/chat", {
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
                onClick={() => setIsOpen(!isOpen)}
                className="
                    fixed
                    bottom-6
                    right-6
                    w-14
                    h-14
                    rounded-full
                    bg-black
                    text-white
                    text-2xl
                    shadow-xl
                    hover:bg-gray-500
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
                        bg-white
                        rounded-2xl
                        shadow-2xl
                        flex
                        flex-col
                        overflow-hidden
                        border
                        z-50
                    "
                >

                    {/* Header */}
                    <div
                        className="
                            bg-black
                            text-white
                            p-4
                            text-lg
                            font-semibold
                            flex
                            justify-between
                            items-center
                        "
                    >
                        <span>Storyteller AI</span>

                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-white text-xl"
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
                            bg-black
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
                                        ? "ml-auto bg-gray-700 text-white"
                                        : "mr-auto bg-white text-black shadow"
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
                            flex
                            gap-2
                            bg-black
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
                                rounded-xl
                                px-4
                                py-2
                                outline-none
                                focus:ring-2
                                bg-white
                                focus:ring-black
                            "
                        />

                        <button
                            onClick={sendMessage}
                            className="
                                bg-white
                                text-black
                                px-5
                                rounded-xl
                                hover:bg-gray-500
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