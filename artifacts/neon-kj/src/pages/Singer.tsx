import { useState, useEffect, useRef } from "react";
import { useLiveQueue } from "@/hooks/use-websocket";
import { useRegisterSinger, useSearchSongs, useAddToQueue, type Song } from "@workspace/api-client-react";
import { useLocalStorage, useDebounceValue } from "usehooks-ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EnergyBadge } from "@/components/EnergyBadge";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Search, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function RegistrationForm({ onComplete }: { onComplete: (id: number, name: string) => void }) {
  const [name, setName] = useState("");
  const { mutate, isPending } = useRegisterSinger();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutate({ data: { name } }, {
      onSuccess: (data) => {
        if (data.id && data.name) onComplete(data.id, data.name);
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md mx-auto p-6 mt-12 glass-panel rounded-3xl text-center">
      <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow-primary">
        <Mic2 className="w-10 h-10 text-primary" />
      </div>
      <h1 className="text-3xl font-display font-black mb-2 text-glow-primary">Welcome to the Stage</h1>
      <p className="text-muted-foreground mb-8">Enter your name to join the karaoke rotation.</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input 
          placeholder="Your Singer Name" 
          value={name} 
          onChange={e => setName(e.target.value)}
          className="h-16 text-center text-xl bg-background/50 border-primary/30 focus-visible:border-primary"
        />
        <Button size="lg" className="w-full h-14 text-lg" disabled={isPending || !name.trim()}>
          {isPending ? "Joining..." : "Enter Neon KJ"}
        </Button>
      </form>
    </motion.div>
  );
}

function SongSearch({ singerId, onQueued }: { singerId: number, onQueued: () => void }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounceValue(query, 300);
  const { data: songs, isLoading } = useSearchSongs({ q: debouncedQuery[0] });
  const { mutate: addToQueue, isPending } = useAddToQueue();
  const { toast } = useToast();

  const handleQueue = (song: Song) => {
    if (!song.id) return;
    addToQueue({ data: { singerId, songId: song.id } }, {
      onSuccess: () => {
        toast({ title: "Song Added!", description: `You're in the queue to sing ${song.title}` });
        onQueued();
      },
      onError: (err: any) => {
        toast({ title: "Oops", description: err.message || "Failed to add song. Maybe you're already in queue?", variant: "destructive" });
      }
    });
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 space-y-6 pb-24">
      <div className="sticky top-4 z-10 glass-panel rounded-2xl p-2 flex items-center gap-2">
        <Search className="w-5 h-5 text-muted-foreground ml-2" />
        <Input 
          autoFocus
          placeholder="Search artist or song..." 
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="border-0 bg-transparent h-12 text-lg focus-visible:ring-0 px-0"
        />
      </div>

      <div className="space-y-3">
        {isLoading && <div className="text-center text-muted-foreground py-8 animate-pulse">Searching library...</div>}
        
        {songs?.map(song => (
          <motion.div 
            key={song.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-4 rounded-2xl flex flex-col gap-3"
          >
            <div>
              <h3 className="font-bold text-lg leading-tight">{song.title}</h3>
              <p className="text-muted-foreground text-sm">{song.artist}</p>
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex gap-2">
                <EnergyBadge score={song.energyScore || 5} />
                {song.genre && <Badge variant="outline" className="border-white/10 text-xs">{song.genre}</Badge>}
              </div>
              <Button size="sm" variant="secondary" className="rounded-xl" disabled={isPending} onClick={() => handleQueue(song)}>
                <PlusCircle className="w-4 h-4 mr-1" /> Request
              </Button>
            </div>
          </motion.div>
        ))}

        {songs?.length === 0 && query && (
          <div className="text-center py-12 text-muted-foreground">
            No songs found matching "{query}"
          </div>
        )}
      </div>
    </div>
  );
}

function QueueStatusCard({ queueEntry, nowPlaying }: { queueEntry: any, nowPlaying: any }) {
  const isNext = queueEntry.position === 1;

  return (
    <div className="w-full max-w-md mx-auto p-4 space-y-6 mt-6">
      {nowPlaying && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-3xl p-6 border-secondary/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-secondary/0 via-secondary to-secondary/0"></div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-secondary shadow-glow-secondary animate-pulse"></div>
            <span className="text-sm font-medium tracking-widest uppercase text-secondary">NOW ON STAGE</span>
          </div>
          <h3 className="text-2xl font-bold">{nowPlaying.singerName}</h3>
          <p className="text-muted-foreground mt-1">singing <span className="text-white font-medium">{nowPlaying.songTitle}</span></p>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`glass-panel rounded-3xl p-8 text-center relative overflow-hidden ${isNext ? 'border-primary shadow-glow-primary' : ''}`}>
        {isNext && <div className="absolute top-0 left-0 w-full h-full bg-primary/5 animate-pulse pointer-events-none"></div>}
        
        <h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground mb-6">Your Status</h2>
        
        <div className="flex justify-center items-center mb-6">
          <div className="w-32 h-32 rounded-full border-4 border-border flex flex-col items-center justify-center relative">
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="62" cy="62" r="60" className="stroke-primary/20 fill-none" strokeWidth="4" />
              <circle cx="62" cy="62" r="60" className="stroke-primary fill-none transition-all duration-1000 ease-out" strokeWidth="4" strokeDasharray="377" strokeDashoffset={isNext ? 0 : 377 * 0.4} strokeLinecap="round" />
            </svg>
            <span className="text-4xl font-display font-black text-white">#{queueEntry.position}</span>
            <span className="text-xs text-muted-foreground">in line</span>
          </div>
        </div>

        <div className="mt-6 text-left border-t border-white/10 pt-6">
          <p className="text-sm text-muted-foreground">You are singing:</p>
          <p className="font-semibold text-lg">{queueEntry.songTitle}</p>
          <p className="text-sm text-muted-foreground">{queueEntry.songArtist}</p>
        </div>
      </motion.div>
    </div>
  );
}

export default function Singer() {
  const [singerId, setSingerId] = useLocalStorage<number | null>("neon_kj_singer_id", null);
  const [singerName, setSingerName] = useLocalStorage<string | null>("neon_kj_singer_name", null);
  const [view, setView] = useState<"search" | "status">("status");
  
  const { connected, queueState } = useLiveQueue();

  // Find user's entry in queue
  const myEntry = queueState?.queue?.find(q => q.singerId === singerId);
  const prevMyEntryRef = useRef<typeof myEntry>(undefined);

  // #13: Only transition view on actual entry appearance/disappearance,
  // not on every queue update — prevents clobbering future view states
  useEffect(() => {
    const had = prevMyEntryRef.current !== undefined;
    const has = myEntry !== undefined;
    if (!had && has) setView("status");
    else if (had && !has) setView("search");
    prevMyEntryRef.current = myEntry;
  }, [myEntry]);

  if (!singerId || !singerName) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
        <img src={`${import.meta.env.BASE_URL}images/neon-bg.png`} className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" alt="Neon background" />
        <div className="relative z-10 flex-1 flex flex-col">
          <RegistrationForm onComplete={(id, name) => {
            setSingerId(id);
            setSingerName(name);
          }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden pb-12">
      <img src={`${import.meta.env.BASE_URL}images/neon-bg.png`} className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none" alt="Neon background" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 glass-panel border-b border-white/5 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="font-display font-bold text-lg tracking-tight">NEON <span className="text-primary text-glow-primary">KJ</span></h1>
          <p className="text-xs text-muted-foreground">Singing as <span className="text-white">{singerName}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`} />
          <span className="text-xs text-muted-foreground">{connected ? 'Live' : 'Connecting...'}</span>
        </div>
      </header>

      <main className="relative z-10">
        {!queueState?.showId ? (
          <div className="text-center py-20 px-4">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mic2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold mb-2">No Active Show</h2>
            <p className="text-muted-foreground">Hang tight! The KJ hasn't started the rotation yet.</p>
          </div>
        ) : view === "search" ? (
          <SongSearch singerId={singerId} onQueued={() => setView("status")} />
        ) : myEntry ? (
          <QueueStatusCard queueEntry={myEntry} nowPlaying={queueState.nowPlaying} />
        ) : (
          <div className="text-center py-20 px-4">
             <Button size="lg" onClick={() => setView("search")} className="rounded-full shadow-glow-primary">
               Browse Song Library
             </Button>
          </div>
        )}
      </main>
    </div>
  );
}
