import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Save,
  FolderOpen,
  Trash2,
  Check,
  X,
  Clock,
  Loader2,
  BookmarkPlus,
  Bookmark,
} from "lucide-react";

interface SaveMixModalProps {
  musicianId: number;
  onClose: () => void;
  onLoaded: () => void;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days === 1) return "ontem";
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function SaveMixModal({ musicianId, onClose, onLoaded }: SaveMixModalProps) {
  const [tab, setTab] = useState<"save" | "load">("save");
  const [name, setName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: presets, isLoading: presetsLoading } = trpc.presets.list.useQuery({ musicianId });
  const savePreset = trpc.presets.save.useMutation();
  const loadPreset = trpc.presets.load.useMutation();
  const deletePreset = trpc.presets.delete.useMutation();

  // Auto-focus input when on save tab
  useEffect(() => {
    if (tab === "save") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [tab]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Digite um nome para o preset");
      inputRef.current?.focus();
      return;
    }
    savePreset.mutate(
      { musicianId, name: trimmed },
      {
        onSuccess: () => {
          utils.presets.list.invalidate({ musicianId });
          toast.success(`Mix "${trimmed}" salvo!`, {
            icon: <Bookmark className="w-4 h-4 text-green-400" />,
          });
          setName("");
          setTab("load"); // Switch to load tab to show the new preset
        },
        onError: () => toast.error("Erro ao salvar preset"),
      }
    );
  };

  const handleLoad = (presetId: number, presetName: string) => {
    loadPreset.mutate(
      { presetId, musicianId },
      {
        onSuccess: () => {
          utils.sends.getForMusician.invalidate({ musicianId });
          toast.success(`Mix "${presetName}" carregado!`, {
            icon: <Check className="w-4 h-4 text-green-400" />,
          });
          onLoaded();
          onClose();
        },
        onError: () => toast.error("Erro ao carregar preset"),
      }
    );
  };

  const handleDelete = (presetId: number) => {
    deletePreset.mutate(
      { id: presetId },
      {
        onSuccess: () => {
          utils.presets.list.invalidate({ musicianId });
          setConfirmDeleteId(null);
          toast.success("Preset removido");
        },
        onError: () => toast.error("Erro ao remover preset"),
      }
    );
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "oklch(0.05 0.005 260 / 0.85)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Sheet */}
      <div
        className="w-full max-w-lg rounded-t-2xl flex flex-col animate-slide-up"
        style={{
          background: "oklch(0.12 0.008 260)",
          border: "1px solid oklch(0.22 0.01 260)",
          borderBottom: "none",
          maxHeight: "85dvh",
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: "oklch(0.30 0.01 260)" }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="w-4 h-4" style={{ color: "oklch(0.72 0.22 142)" }} />
            <span
              className="text-sm font-bold"
              style={{ color: "oklch(0.90 0.01 260)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              MIXES SALVOS
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "oklch(0.45 0.01 260)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex mx-4 mb-3 rounded-lg p-0.5"
          style={{ background: "oklch(0.09 0.005 260)" }}
        >
          {(["save", "load"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-mono font-semibold transition-all"
              style={{
                background: tab === t ? "oklch(0.18 0.01 260)" : "transparent",
                color: tab === t ? "oklch(0.85 0.01 260)" : "oklch(0.45 0.01 260)",
                border: tab === t ? "1px solid oklch(0.28 0.01 260)" : "1px solid transparent",
              }}
            >
              {t === "save" ? <Save className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
              {t === "save" ? "SALVAR MIX" : `CARREGAR${presets?.length ? ` (${presets.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {/* ── Save Tab ── */}
          {tab === "save" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-mono" style={{ color: "oklch(0.50 0.01 260)" }}>
                Salva os níveis atuais de todos os canais como um preset pessoal.
              </p>

              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  placeholder="Ex: Ensaio quarta, Show domingo..."
                  maxLength={128}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm font-mono"
                  style={{
                    background: "oklch(0.09 0.005 260)",
                    border: "1px solid oklch(0.25 0.01 260)",
                    color: "oklch(0.90 0.01 260)",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "oklch(0.72 0.22 142 / 0.6)")}
                  onBlur={(e) => (e.target.style.borderColor = "oklch(0.25 0.01 260)")}
                />
              </div>

              <button
                onClick={handleSave}
                disabled={savePreset.isPending || !name.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-mono font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                style={{
                  background: savePreset.isPending
                    ? "oklch(0.72 0.22 142 / 0.3)"
                    : "oklch(0.72 0.22 142)",
                  color: "oklch(0.10 0.005 260)",
                  boxShadow: savePreset.isPending ? "none" : "0 0 20px oklch(0.72 0.22 142 / 0.3)",
                }}
              >
                {savePreset.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {savePreset.isPending ? "SALVANDO..." : "SALVAR MIX ATUAL"}
              </button>

              {/* Quick-save hint */}
              {presets && presets.length > 0 && (
                <p className="text-center text-xs font-mono" style={{ color: "oklch(0.38 0.01 260)" }}>
                  {presets.length} preset{presets.length !== 1 ? "s" : ""} salvo{presets.length !== 1 ? "s" : ""}
                  {" · "}
                  <button
                    onClick={() => setTab("load")}
                    className="underline"
                    style={{ color: "oklch(0.55 0.15 230)" }}
                  >
                    ver todos
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ── Load Tab ── */}
          {tab === "load" && (
            <div className="flex flex-col gap-2">
              {presetsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "oklch(0.72 0.22 142)" }} />
                </div>
              ) : presets && presets.length > 0 ? (
                presets
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={{
                        background: "oklch(0.10 0.006 260)",
                        border: "1px solid oklch(0.20 0.01 260)",
                      }}
                    >
                      {/* Preset icon */}
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background: "oklch(0.72 0.22 142 / 0.12)",
                          border: "1px solid oklch(0.72 0.22 142 / 0.25)",
                        }}
                      >
                        <Bookmark className="w-4 h-4" style={{ color: "oklch(0.72 0.22 142)" }} />
                      </div>

                      {/* Name + date */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-mono font-semibold truncate"
                          style={{ color: "oklch(0.85 0.01 260)" }}
                        >
                          {preset.name}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" style={{ color: "oklch(0.40 0.01 260)" }} />
                          <span className="text-[10px] font-mono" style={{ color: "oklch(0.40 0.01 260)" }}>
                            {formatRelativeTime(preset.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {confirmDeleteId === preset.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(preset.id)}
                              disabled={deletePreset.isPending}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-95"
                              style={{
                                background: "oklch(0.62 0.25 25)",
                                color: "oklch(0.98 0.005 260)",
                              }}
                            >
                              {deletePreset.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "EXCLUIR"
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: "oklch(0.50 0.01 260)" }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setConfirmDeleteId(preset.id)}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: "oklch(0.38 0.01 260)" }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleLoad(preset.id, preset.name)}
                              disabled={loadPreset.isPending}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-95"
                              style={{
                                background: "oklch(0.65 0.20 230 / 0.15)",
                                border: "1px solid oklch(0.65 0.20 230 / 0.35)",
                                color: "oklch(0.65 0.20 230)",
                              }}
                            >
                              {loadPreset.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <FolderOpen className="w-3 h-3" />
                              )}
                              CARREGAR
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "oklch(0.15 0.008 260)",
                      border: "1px solid oklch(0.22 0.01 260)",
                    }}
                  >
                    <Bookmark className="w-6 h-6" style={{ color: "oklch(0.30 0.01 260)" }} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-mono font-semibold" style={{ color: "oklch(0.50 0.01 260)" }}>
                      Nenhum mix salvo
                    </p>
                    <p className="text-xs font-mono mt-1" style={{ color: "oklch(0.35 0.01 260)" }}>
                      Salve seu mix atual para acessar depois
                    </p>
                  </div>
                  <button
                    onClick={() => setTab("save")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95"
                    style={{
                      background: "oklch(0.72 0.22 142 / 0.15)",
                      border: "1px solid oklch(0.72 0.22 142 / 0.35)",
                      color: "oklch(0.72 0.22 142)",
                    }}
                  >
                    <Save className="w-3 h-3" />
                    SALVAR MIX AGORA
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
