import type { PresenceUser } from '../lib/types'

interface MemberListProps {
  members: PresenceUser[]
  myNickname: string
}

export default function MemberList({ members, myNickname }: MemberListProps) {
  return (
    <div className="w-48 lg:w-56 border-l border-bdr bg-surface-2/50 flex flex-col shrink-0 hidden sm:flex">
      <div className="px-3 py-3 border-b border-bdr">
        <h3 className="text-xs font-medium text-txt-3 tracking-wide">
          在线成员 · {members.length}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {members.length === 0 ? (
          <p className="text-xs text-txt-4 text-center py-4">暂无成员</p>
        ) : (
          <div className="space-y-0.5 px-2">
            {/* Show self first */}
            {members
              .slice()
              .sort((a, b) => {
                if (a.nickname === myNickname) return -1
                if (b.nickname === myNickname) return 1
                return a.nickname.localeCompare(b.nickname)
              })
              .map((user) => {
                const isSelf = user.nickname === myNickname
                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
                      isSelf ? 'bg-surface-hover/50' : 'hover:bg-surface-hover/30'
                    }`}
                  >
                    <div className="relative">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isSelf
                          ? 'bg-accent-600 text-white'
                          : 'bg-accent-100 text-accent-700 dark:bg-accent-900/60 dark:text-accent-300'
                      }`}>
                        {user.nickname.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-surface-2" />
                    </div>
                    <span className={`truncate text-xs ${isSelf ? 'text-txt font-semibold' : 'text-txt font-medium'}`}>
                      {user.nickname}
                    </span>
                    {isSelf && (
                      <span className="text-[9px] text-accent-500 ml-auto shrink-0">我</span>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
