import { useRef } from 'react'

const EMOJIS = [
  '😀','😂','🤣','😊','😍','🥰','😘','😎',
  '🤔','🤗','😅','😭','😤','😡','🥺','😱',
  '🤯','😴','🙄','😏','🥳','😇','🤩','😬',
  '👍','👎','👏','🙏','💪','✌️','🤞','👋',
  '❤️','🧡','💛','💚','💙','💜','🖤','💔',
  '🔥','💯','⭐','🎉','🎊','⚡','💫','✨',
  '🍕','🍔','🍟','☕','🍺','🎵','🎶','🎮',
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div
      className="absolute bottom-full left-0 mb-2 bg-surface-3 border border-bdr rounded-xl shadow-xl z-20 w-[280px]"
      ref={ref}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-bdr">
        <span className="text-xs text-txt-3 font-medium">表情</span>
        <button
          onClick={onClose}
          className="text-txt-4 hover:text-txt-2 text-xs"
        >
          ✕
        </button>
      </div>
      <div className="emoji-grid grid grid-cols-8 gap-0.5 p-2 max-h-[200px] overflow-y-auto">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose() }}
            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-surface-hover rounded transition cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
