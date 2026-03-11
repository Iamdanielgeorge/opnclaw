import { useEffect, useState, useRef } from 'react'
import { chat, agents } from '../api'
import type { ChatMessage, ChatSession, Agent } from '../api'

export default function ChatTab() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [agentList, setAgentList] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chat.sessions().then(setSessions).catch(() => {})
    agents.list().then(setAgentList).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeChatId) {
      chat.messages(activeChatId).then(setMessages).catch(() => {})
    } else {
      setMessages([])
    }
  }, [activeChatId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || loading) return

    setInput('')
    setLoading(true)

    // Optimistic user message
    const tempMsg: ChatMessage = {
      id: -Date.now(),
      chat_id: activeChatId ?? '',
      role: 'user',
      content: msg,
      created_at: Math.floor(Date.now() / 1000),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await chat.send(msg, activeChatId ?? undefined, selectedAgent || undefined)

      if (!activeChatId) {
        setActiveChatId(res.chatId)
      }

      const assistantMsg: ChatMessage = {
        id: -(Date.now() + 1),
        chat_id: res.chatId,
        role: 'assistant',
        content: res.response,
        created_at: Math.floor(Date.now() / 1000),
      }
      setMessages(prev => [...prev, assistantMsg])

      // Refresh session list
      chat.sessions().then(setSessions).catch(() => {})
    } catch {
      const errMsg: ChatMessage = {
        id: -(Date.now() + 2),
        chat_id: activeChatId ?? '',
        role: 'assistant',
        content: '(failed to get response)',
        created_at: Math.floor(Date.now() / 1000),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleNewChat = () => {
    setActiveChatId(null)
    setMessages([])
    setInput('')
  }

  const handleDeleteSession = async (chatId: string) => {
    await chat.delete(chatId).catch(() => {})
    setSessions(prev => prev.filter(s => s.chat_id !== chatId))
    if (activeChatId === chatId) {
      handleNewChat()
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* Sidebar */}
      <div className="w-56 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={handleNewChat}
            className="w-full px-3 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.map(s => (
            <div
              key={s.chat_id}
              className={`group flex items-center px-3 py-2.5 cursor-pointer text-sm border-b border-zinc-800/50 transition-colors ${
                activeChatId === s.chat_id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
              }`}
              onClick={() => setActiveChatId(s.chat_id)}
            >
              <div className="flex-1 min-w-0">
                <p className="truncate">{s.last_message?.slice(0, 40) || s.chat_id}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{s.message_count} messages</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.chat_id) }}
                className="hidden group-hover:block text-zinc-600 hover:text-red-400 text-xs ml-1"
                title="Delete"
              >x</button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-xs text-zinc-600 p-3">No chat sessions yet</p>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Agent selector */}
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Agent:</span>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-2 py-1"
          >
            <option value="">Default</option>
            {agentList.filter(a => a.is_active).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-zinc-600 text-sm">Start a conversation</p>
            </div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-violet-600/30 text-zinc-100'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 border border-zinc-700 text-zinc-500 text-sm px-3 py-2 rounded-lg">
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-zinc-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Type a message..."
              disabled={loading}
              className="flex-1 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-2 text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600 text-white text-sm rounded-lg transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
