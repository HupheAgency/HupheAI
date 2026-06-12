interface Member {
  id: string
  name: string
  color?: string
}

interface Props {
  members: Member[]
  max?: number
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function isCssColor(color?: string): boolean {
  if (!color) return false
  return color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')
}

export default function PresenceAvatars({ members, max = 4 }: Props) {
  const visibleMembers = members.slice(0, max)
  const overflowCount = Math.max(0, members.length - visibleMembers.length)

  if (members.length === 0) return null

  return (
    <div className="flex items-center">
      {visibleMembers.map((member, index) => {
        const fallbackColor = '#facc15'
        const cssColor = isCssColor(member.color) ? member.color : fallbackColor
        const tailwindColorClass = member.color && !isCssColor(member.color) ? member.color : ''

        return (
          <div
            key={member.id}
            title={member.name}
            className={[
              'w-[26px] h-[26px] rounded-full border border-black/40 flex items-center justify-center text-black text-[10px] font-bold shadow-sm',
              index > 0 ? '-ml-1.5' : '',
              tailwindColorClass,
            ].join(' ')}
            style={{ backgroundColor: tailwindColorClass ? undefined : cssColor }}
          >
            {getInitials(member.name)}
          </div>
        )
      })}

      {overflowCount > 0 && (
        <div
          title={`${overflowCount} extra kijker${overflowCount === 1 ? '' : 's'}`}
          className="-ml-1.5 w-[26px] h-[26px] rounded-full border border-black/40 bg-white/[0.10] flex items-center justify-center text-white/60 text-[10px] font-bold shadow-sm"
        >
          +{overflowCount}
        </div>
      )}
    </div>
  )
}
