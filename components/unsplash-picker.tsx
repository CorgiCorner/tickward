import { ImageIcon, SearchIcon, XIcon } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMessage } from "@/lib/i18n/messages"
import type { UnsplashImage } from "@/lib/schemas/timer"

const PHOTO_SKELETON_KEYS = ["photo-1", "photo-2", "photo-3", "photo-4", "photo-5", "photo-6", "photo-7", "photo-8"]

type UnsplashPhoto = {
  id: string
  urls: { thumb: string; small: string; regular: string }
  user: { name: string; links: { html: string } }
}

function UnsplashSearchResults(
  props: Readonly<{
    loading: boolean
    error: string
    results: UnsplashPhoto[]
    searched: boolean
    onSelect: (photo: UnsplashPhoto) => Promise<void>
  }>,
) {
  if (props.loading) {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {PHOTO_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square rounded-lg" />
        ))}
      </div>
    )
  }

  if (props.error) {
    return <div className="flex items-center justify-center py-12 text-sm text-destructive">{props.error}</div>
  }

  if (props.results.length > 0) {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {props.results.map((photo) => (
          <button
            key={photo.id}
            type="button"
            className="group relative overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={() => {
              void props.onSelect(photo)
            }}
          >
            <Image
              src={photo.urls.thumb}
              alt=""
              width={160}
              height={160}
              sizes="(max-width: 640px) 22vw, 120px"
              unoptimized
              className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4">
              <a
                href={`${photo.user.links.html}?utm_source=tickward&utm_medium=referral`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[10px] text-white/80 hover:text-white"
                onClick={(e) => e.stopPropagation()}
              >
                {formatMessage("unsplash.by", { name: photo.user.name })}
              </a>
            </div>
          </button>
        ))}
      </div>
    )
  }

  if (props.searched) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {formatMessage("unsplash.noPhotos")}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      {formatMessage("unsplash.typeToSearch")}
    </div>
  )
}

export function UnsplashPicker(
  props: Readonly<{
    value?: UnsplashImage | null
    onChange: (image: UnsplashImage | null) => void
  }>,
) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UnsplashPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [searched, setSearched] = useState(false)
  const searchRequestRef = useRef(0)

  function clearSearchState() {
    searchRequestRef.current += 1
    setResults([])
    setSearched(false)
    setLoading(false)
    setError("")
  }

  useEffect(() => {
    const q = query.trim()
    if (!q) return

    const requestId = searchRequestRef.current + 1
    searchRequestRef.current = requestId

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      setLoading(true)
      setError("")
      setSearched(true)

      void fetch(`/api/unsplash/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(formatMessage("errors.searchFailed"))
          return (await res.json()) as { results: UnsplashPhoto[] }
        })
        .then((data) => {
          if (searchRequestRef.current !== requestId) return
          setResults(data.results)
        })
        .catch(() => {
          if (controller.signal.aborted || searchRequestRef.current !== requestId) return
          setError(formatMessage("unsplash.failed"))
          setResults([])
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setLoading(false)
        })
    }, 300)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [query])

  async function selectPhoto(photo: UnsplashPhoto) {
    // Trigger download endpoint (required by Unsplash)
    fetch("/api/unsplash/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoId: photo.id }),
    }).catch(() => {})

    props.onChange({
      unsplashId: photo.id,
      url: photo.urls.regular,
      thumbUrl: photo.urls.small,
      authorName: photo.user.name,
      authorUrl: photo.user.links.html,
    })
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-2">
      {props.value ? (
        <div className="flex items-center gap-2">
          <Image
            src={props.value.thumbUrl}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="size-10 rounded-lg object-cover"
          />
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {formatMessage("unsplash.by", { name: props.value.authorName })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={formatMessage("unsplash.removePhoto")}
            onClick={() => props.onChange(null)}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (next) {
              setQuery("")
              clearSearchState()
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <ImageIcon className="size-3.5" />
              {formatMessage("unsplash.addPhoto")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(calc(100vw-2rem),32rem)]" align="start">
            <PopoverHeader>
              <PopoverTitle>{formatMessage("unsplash.choosePhoto")}</PopoverTitle>
              <PopoverDescription>{formatMessage("unsplash.searchDescription")}</PopoverDescription>
            </PopoverHeader>

            <div className="relative mt-3">
              <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={formatMessage("unsplash.searchPlaceholder")}
                value={query}
                onChange={(e) => {
                  const nextQuery = e.target.value
                  setQuery(nextQuery)
                  if (!nextQuery.trim()) clearSearchState()
                }}
                className="pl-8"
                autoFocus
              />
            </div>

            <div className="min-h-[200px]">
              <UnsplashSearchResults
                loading={loading}
                error={error}
                results={results}
                searched={searched}
                onSelect={selectPhoto}
              />
            </div>

            <div className="text-[10px] text-muted-foreground text-center">
              {formatMessage("unsplash.photosBy")}{" "}
              <a
                href="https://unsplash.com/?utm_source=tickward&utm_medium=referral"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Unsplash
              </a>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
