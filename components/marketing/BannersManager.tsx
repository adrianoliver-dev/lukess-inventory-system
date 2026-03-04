"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trash2, Plus, Image as ImageIcon, Loader2, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { BannerUploadModal } from "@/components/marketing/BannerUploadModal";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface Banner {
    id: string;
    image_url?: string; // deprecated, kept for backward compat
    desktop_image_url: string;
    mobile_image_url: string | null;
    title: string | null;
    link: string | null;
    is_active: boolean;
    display_order: number;
    start_date: string;
    end_date: string | null;
}

export function BannersManager(): React.JSX.Element {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        fetchBanners();
    }, []);

    const fetchBanners = async (): Promise<void> => {
        setLoading(true);
        const { data, error } = await supabase
            .from("banners")
            .select("*")
            .order("display_order", { ascending: true });

        if (error) {
            toast.error("Error al cargar banners");
        } else {
            setBanners((data || []) as Banner[]);
        }
        setLoading(false);
    };

    const toggleActive = async (id: string, current: boolean): Promise<void> => {
        const { error } = await supabase
            .from("banners")
            .update({ is_active: !current })
            .eq("id", id);
        if (!error) {
            setBanners(banners.map(b => b.id === id ? { ...b, is_active: !current } : b));
            toast.success(current ? "Banner desactivado" : "Banner activado");
        }
    };

    const handleDelete = async (id: string, desktopUrl: string, mobileUrl: string | null): Promise<void> => {
        if (!confirm("¿Eliminar este banner?")) return;

        // Extract storage paths from URLs
        const extractPath = (url: string): string => {
            const parts = url.split("/banners/");
            return parts.length > 1 ? parts[1] : url.split("/").slice(-1)[0];
        };

        const filesToRemove: string[] = [extractPath(desktopUrl)];
        if (mobileUrl) filesToRemove.push(extractPath(mobileUrl));

        await supabase.storage.from("banners").remove(filesToRemove);
        const { error } = await supabase.from("banners").delete().eq("id", id);

        if (!error) {
            setBanners(banners.filter(b => b.id !== id));
            toast.success("Banner eliminado");
        }
    };

    const updateBannerField = async (id: string, field: "title" | "link", value: string): Promise<void> => {
        const { error } = await supabase
            .from("banners")
            .update({ [field]: value })
            .eq("id", id);

        if (error) {
            toast.error("Error al actualizar");
        } else {
            setBanners(banners.map(b => b.id === id ? { ...b, [field]: value } : b));
        }
    };

    const moveBanner = async (index: number, direction: "up" | "down"): Promise<void> => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= banners.length) return;

        const currentBanner = banners[index];
        const targetBanner = banners[targetIndex];

        // Swap display_order
        const { error } = await supabase.from("banners").update({ display_order: targetBanner.display_order }).eq("id", currentBanner.id);
        const { error: error2 } = await supabase.from("banners").update({ display_order: currentBanner.display_order }).eq("id", targetBanner.id);

        if (error || error2) {
            toast.error("Error al reordenar");
        } else {
            fetchBanners();
        }
    };

    const formatDate = (dateStr: string | null): string => {
        if (!dateStr) return "Sin expiración";
        try {
            return format(parseISO(dateStr), "dd MMM yyyy", { locale: es });
        } catch {
            return "—";
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-xl font-bold text-zinc-900 mb-1">Banners Activos</h2>
                    <p className="text-xs text-zinc-500">Dimensiones recomendadas: Desktop (1920x800px, 21:9) | Mobile (800x1200px, 2:3). Máximo 2MB.</p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Subir Banner
                </button>
            </div>

            {showUploadModal && (
                <BannerUploadModal
                    onClose={() => setShowUploadModal(false)}
                    onSuccess={() => {
                        setShowUploadModal(false);
                        fetchBanners();
                    }}
                    bannersCount={banners.length}
                />
            )}

            {banners.length === 0 ? (
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ImageIcon className="w-8 h-8 text-zinc-400" />
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900 mb-1">Sin Banners</h3>
                    <p className="text-zinc-500 font-medium max-w-sm mx-auto">
                        Sube la primera imagen para mostrarla en el inicio de la tienda.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {banners.map((banner, index) => (
                        <div key={banner.id} className="group relative bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="aspect-[21/9] bg-zinc-100 relative">
                                <img
                                    src={banner.desktop_image_url}
                                    alt={banner.title || "Banner"}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute top-2 right-2 flex gap-2">
                                    <div className="flex bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-zinc-200 overflow-hidden">
                                        <button
                                            disabled={index === 0}
                                            onClick={() => moveBanner(index, "up")}
                                            className="p-1.5 hover:bg-zinc-100 text-zinc-600 disabled:opacity-30 transition-colors border-r border-zinc-200"
                                            title="Subir"
                                        >
                                            <ChevronUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            disabled={index === banners.length - 1}
                                            onClick={() => moveBanner(index, "down")}
                                            className="p-1.5 hover:bg-zinc-100 text-zinc-600 disabled:opacity-30 transition-colors"
                                            title="Bajar"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => toggleActive(banner.id, banner.is_active)}
                                        className={`px-2 py-1 text-xs font-bold rounded-full ${banner.is_active
                                            ? "bg-green-100 text-green-700"
                                            : "bg-zinc-200 text-zinc-600"
                                            }`}
                                    >
                                        {banner.is_active ? "Activo" : "Inactivo"}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(banner.id, banner.desktop_image_url, banner.mobile_image_url)}
                                        className="p-1.5 bg-white text-red-600 rounded-full shadow-sm hover:bg-red-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-zinc-400 group/title">
                                        <Pencil className="w-3 h-3 group-focus-within/title:text-gold-500" />
                                        <input
                                            type="text"
                                            defaultValue={banner.title || ""}
                                            onBlur={(e) => updateBannerField(banner.id, "title", e.target.value)}
                                            placeholder="Título del banner"
                                            className="w-full border-0 border-b border-zinc-100 focus:border-gold-500 bg-transparent outline-none text-sm font-bold text-zinc-900 placeholder:font-normal placeholder:text-zinc-400 py-0.5 transition-colors"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 text-zinc-400 group/link">
                                        <Pencil className="w-3 h-3 group-focus-within/link:text-gold-500" />
                                        <input
                                            type="text"
                                            defaultValue={banner.link || ""}
                                            onBlur={(e) => updateBannerField(banner.id, "link", e.target.value)}
                                            placeholder="Enlace (ej: /catalogo)"
                                            className="w-full border-0 border-b border-zinc-100 focus:border-gold-500 bg-transparent outline-none text-xs text-zinc-500 font-medium py-0.5 transition-colors"
                                        />
                                    </div>
                                </div>
                                {/* Date badges */}
                                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-100">
                                    <span className="text-xs text-zinc-500 bg-zinc-50 px-2 py-0.5 rounded-md border border-zinc-100">
                                        Desde {formatDate(banner.start_date)}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-md border ${banner.end_date
                                        ? "text-amber-700 bg-amber-50 border-amber-100"
                                        : "text-zinc-400 bg-zinc-50 border-zinc-100"
                                        }`}>
                                        {banner.end_date ? `Expira ${formatDate(banner.end_date)}` : "Sin expiración"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
