'use client'

import { useRouter, usePathname } from 'next/navigation'

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  tags: Tag[]
  activeTagId: string | null
}

export default function TagFilter({ tags, activeTagId }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function handleSelect(tagId: string | null) {
    const params = new URLSearchParams()
    if (tagId) params.set('tagId', tagId)
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-500 shrink-0">依標籤篩選：</span>

      {/* All / clear filter */}
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className={`rounded-full px-3 py-0.5 text-xs font-medium border transition-colors ${
          !activeTagId
            ? 'bg-zinc-800 text-white border-zinc-800'
            : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500'
        }`}
      >
        全部
      </button>

      {tags.map((tag) => {
        const isActive = activeTagId === tag.id
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => handleSelect(isActive ? null : tag.id)}
            className={`rounded-full px-3 py-0.5 text-xs font-medium border transition-all ${
              isActive ? 'text-white border-transparent' : 'bg-white border-transparent hover:opacity-80'
            }`}
            style={
              isActive
                ? { backgroundColor: tag.color, borderColor: tag.color }
                : { color: tag.color, backgroundColor: `${tag.color}20`, borderColor: `${tag.color}40` }
            }
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
