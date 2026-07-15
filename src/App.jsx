import { useState } from 'react'
import Scene from './components/Scene'
import Chat from './components/chatBot.jsx'

const App = () => {
  const [chatOpen, setChatOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <>
      <Scene
        searchOpen={searchOpen}
        onSearchOpenChange={(open) => {
          if (open) setChatOpen(false)
          setSearchOpen(open)
        }}
      />
      <Chat
        isOpen={chatOpen}
        onOpenChange={(open) => {
          if (open) setSearchOpen(false)
          setChatOpen(open)
        }}
      />
    </>
  )
}

export default App