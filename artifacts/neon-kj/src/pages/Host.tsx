import { useState, useRef, useEffect } from "react";
import { useLiveQueue } from "@/hooks/use-websocket";
import { useAdvanceQueue, useReorderQueue, useSkipQueueEntry, useRemoveFromQueue, useGetQrCode, useEndShow } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EnergyBadge } from "@/components/EnergyBadge";
import { formatWaitTime } from "@/lib/utils";
import { StartShowModal } from "@/components/StartShowModal";
import { motion, AnimatePresence } from "framer-motion";
import { Play, SkipForward, Trash2, GripVertical, AlertTriangle, Users, Clock, Flame, Tv2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function DraggableQueueRow({ item, index, onReorder, onSkip, onRemove }: any) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Very simple HTML5 drag and drop implementation as requested
  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
    // Slight delay to allow visual update
    setTimeout(() => { if (rowRef.current) rowRef.current.style.opacity = '0.4'; }, 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (rowRef.current) rowRef.current.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (draggedIdx !== index && !isNaN(draggedIdx)) {
      onReorder(draggedIdx, index);
    }
  };

  return (
    <div 
      ref={rowRef}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`grid grid-cols-[40px_1fr_2fr_1fr_120px_100px] items-center gap-4 p-4 border-b border-white/5 hover:bg-white/5 transition-colors group ${isDragging ? 'bg-primary/10' : ''}`}
    >
      <div className="flex items-center gap-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-white">
        <GripVertical className="w-4 h-4" />
        <span className="font-display font-bold text-lg">{item.position}</span>
      </div>
      <div className="font-semibold">{item.singerName}</div>
      <div>
        <div className="font-medium text-white">{item.songTitle}</div>
        <div className="text-sm text-muted-foreground">{item.songArtist}</div>
      </div>
      <div><EnergyBadge score={item.songEnergyScore || 5} /></div>
      <div className="font-mono text-sm">{formatWaitTime(item.waitTimeMinutes)}</div>
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="secondary" className="h-8 w-8 rounded-lg" onClick={() => onSkip(item.entryId)} title="Skip">
          <SkipForward className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="destructive" className="h-8 w-8 rounded-lg" onClick={() => onRemove(item.entryId)} title="Remove">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Host() {
  const { connected, queueState } = useLiveQueue();
  const [showStartModal, setShowStartModal] = useState(false);
  const { toast } = useToast();
  
  const { mutate: advance, isPending: isAdvancing } = useAdvanceQueue();
  const { mutate: skip } = useSkipQueueEntry();
  const { mutate: remove } = useRemoveFromQueue();
  const { mutate: reorder } = useReorderQueue();
  const { mutate: endShow } = useEndShow();
  const { data: qrData } = useGetQrCode();

  const handleAdvance = () => {
    advance(undefined, {
      onSuccess: () => toast({ title: "Queue Advanced" })
    });
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (!queueState?.queue) return;
    const newQueue = [...queueState.queue];
    const [moved] = newQueue.splice(fromIdx, 1);
    newQueue.splice(toIdx, 0, moved);
    const orderedIds = newQueue.map(q => q.entryId!);
    reorder({ data: { orderedIds } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative">
      <img src={`${import.meta.env.BASE_URL}images/host-bg.png`} className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none" alt="Background" />
      
      {/* Header */}
      <header className="relative z-10 glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="font-display font-black text-2xl tracking-tight">NEON <span className="text-primary text-glow-primary">KJ</span></h1>
          {queueState?.showId && (
            <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 px-3 py-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2"></span>
              {queueState.showName}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {queueState?.isPeakHours && (
            <Badge variant="accent" className="animate-pulse shadow-glow-accent">Peak Hours Active</Badge>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
            <Users className="w-4 h-4" />
            <span>{queueState?.queue?.length || 0} Waiting</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`} />
            <span>{connected ? 'WS Connected' : 'Disconnected'}</span>
          </div>
          
          <Button
            variant="outline"
            className="rounded-full border-white/20 text-white/70 hover:text-white hover:border-white/40"
            onClick={() => window.open("/crowd", "_blank")}
            title="Open crowd display in a new window"
          >
            <Tv2 className="w-4 h-4 mr-2" />
            Crowd Screen
          </Button>

          {!queueState?.showId ? (
            <Button onClick={() => setShowStartModal(true)} className="rounded-full">Start Show</Button>
          ) : (
            <Button variant="outline" className="rounded-full border-destructive/50 text-destructive hover:bg-destructive hover:text-white" onClick={() => {
              if (confirm("End the current show?")) endShow();
            }}>End Show</Button>
          )}
        </div>
      </header>

      <main className="flex-1 relative z-10 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6">
          
          {/* Now Playing Panel */}
          {queueState?.showId && (
            <div className="glass-panel rounded-3xl p-6 border border-white/10 flex items-center justify-between shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 bg-gradient-to-b from-primary to-secondary h-full"></div>
              
              <div className="flex-1">
                <div className="text-sm font-bold tracking-widest uppercase text-muted-foreground mb-2 flex items-center gap-2">
                  <Play className="w-4 h-4 text-primary" fill="currentColor" />
                  Now On Stage
                </div>
                {queueState.nowPlaying ? (
                  <div>
                    <h2 className="text-4xl font-display font-black text-white mb-1">{queueState.nowPlaying.singerName}</h2>
                    <div className="flex items-center gap-4 text-lg text-muted-foreground">
                      <span><span className="text-white">{queueState.nowPlaying.songTitle}</span> by {queueState.nowPlaying.songArtist}</span>
                      <EnergyBadge score={queueState.nowPlaying.songEnergyScore || 5} />
                    </div>
                  </div>
                ) : (
                  <div className="text-2xl text-muted-foreground font-display py-4">Stage is empty</div>
                )}
              </div>
              
              <Button 
                size="lg" 
                className="h-16 px-8 text-lg rounded-2xl group shadow-glow-primary"
                onClick={handleAdvance}
                disabled={isAdvancing}
              >
                {isAdvancing ? "Advancing..." : queueState.nowPlaying ? "Advance to Next" : "Call First Singer"}
                <SkipForward className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          )}

          {/* Low Energy Alert */}
          <AnimatePresence>
            {queueState?.lowEnergyAlert && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-4 rounded-2xl flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-medium">Energy Drop Detected! The last 3 songs were low-energy. Consider suggesting a high-energy track next.</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Queue Table */}
          {queueState?.showId ? (
            <div className="flex-1 glass-panel rounded-3xl border border-white/5 flex flex-col overflow-hidden">
              <div className="grid grid-cols-[40px_1fr_2fr_1fr_120px_100px] gap-4 p-4 border-b border-white/10 bg-white/5 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                <div>#</div>
                <div>Singer</div>
                <div>Song</div>
                <div>Energy</div>
                <div>Est. Wait</div>
                <div>Actions</div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                <AnimatePresence mode="popLayout">
                  {queueState.queue?.map((item, idx) => (
                    <motion.div key={item.entryId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                      <DraggableQueueRow 
                        item={item} 
                        index={idx}
                        onReorder={handleReorder}
                        onSkip={(id: number) => skip({ id })}
                        onRemove={(id: number) => { if(confirm("Remove from queue?")) remove({ id }) }}
                      />
                    </motion.div>
                  ))}
                  {(!queueState.queue || queueState.queue.length === 0) && (
                    <div className="text-center py-20 text-muted-foreground flex flex-col items-center">
                      <Users className="w-12 h-12 mb-4 opacity-20" />
                      <p>Queue is empty.</p>
                      <p className="text-sm mt-1">Singers can join using the QR code.</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/10 rounded-3xl">
              <div className="text-center">
                <h2 className="text-2xl font-display text-muted-foreground mb-4">No Show Running</h2>
                <Button size="lg" onClick={() => setShowStartModal(true)}>Start a Show</Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar (QR Code) */}
        {queueState?.showId && (
          <div className="w-80 border-l border-white/5 bg-black/40 p-6 flex flex-col gap-6 backdrop-blur-md">
            <div className="glass-panel rounded-3xl p-6 text-center shadow-xl border-primary/20 relative overflow-hidden group">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <h3 className="font-display font-bold text-lg mb-4 text-glow-primary">Join the Queue</h3>
              {qrData?.qrDataUrl ? (
                <div className="bg-white p-2 rounded-xl mb-4 shadow-glow-primary inline-block">
                  <img src={qrData.qrDataUrl} alt="Join QR Code" className="w-48 h-48" />
                </div>
              ) : (
                <div className="w-48 h-48 bg-white/10 rounded-xl mx-auto mb-4 animate-pulse"></div>
              )}
              <p className="text-sm font-mono text-muted-foreground break-all bg-black/50 p-2 rounded-lg border border-white/5">
                {qrData?.url || "Loading..."}
              </p>
            </div>
            
            <div className="flex-1 glass-panel rounded-3xl p-6 border-white/5">
              <h3 className="font-bold text-muted-foreground uppercase tracking-widest text-xs mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">Total Singers</div>
                  <div className="text-2xl font-display font-bold text-white">{queueState.queue?.length || 0}</div>
                </div>
                <div className="h-px bg-white/10 w-full"></div>
                <div>
                  <div className="text-sm text-muted-foreground">Est. Show Run Time</div>
                  <div className="text-2xl font-display font-bold text-white">
                    {formatWaitTime(queueState.queue?.reduce((acc, q) => acc + (q.songDurationMinutes || 0), 0) || 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <StartShowModal isOpen={showStartModal} onClose={() => setShowStartModal(false)} />
    </div>
  );
}
