import { useState } from "react";
import { useCreateShow } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, X } from "lucide-react";

export function StartShowModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [name, setName] = useState("");
  const { mutate, isPending } = useCreateShow();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutate({ data: { name } }, {
      onSuccess: () => {
        onClose();
        setName("");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-md rounded-2xl p-6 relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary/20 rounded-xl">
            <Mic2 className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl font-display font-bold">Start New Show</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Show Name</label>
            <Input 
              autoFocus
              placeholder="e.g. Friday Night Neon" 
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-lg h-14"
            />
          </div>
          <Button 
            type="submit" 
            size="lg" 
            className="w-full"
            disabled={isPending || !name.trim()}
          >
            {isPending ? "Starting..." : "Start Show"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
