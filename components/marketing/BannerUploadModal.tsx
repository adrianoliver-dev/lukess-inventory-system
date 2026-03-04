"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Upload, Loader2, Monitor, Smartphone } from "lucide-react";
import toast from "react-hot-toast";

interface BannerUploadModalProps {
    onClose: () => void;
    onSuccess: () => void;
    bannersCount: number;
}

interface FormErrors {
    title?: string;
    link?: string;
    endDate?: string;
    desktopFile?: string;
    mobileFile?: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function validateFile(file: File): string | null {
    if (file.size > MAX_SIZE) return "Imagen máx 2MB";
    if (!ALLOWED_TYPES.includes(file.type)) return "Formato no permitido. Usa JPG, PNG, WebP o GIF";
    return null;
}

export function BannerUploadModal({ onClose, onSuccess, bannersCount }: BannerUploadModalProps): React.JSX.Element {
    const supabase = createClient();

    // Form fields
    const [title, setTitle] = useState("");
    const [link, setLink] = useState("/");
    const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
    const [endDate, setEndDate] = useState("");

    // File state
    const [desktopFile, setDesktopFile] = useState<File | null>(null);
    const [mobileFile, setMobileFile] = useState<File | null>(null);
    const [desktopPreview, setDesktopPreview] = useState<string | null>(null);
    const [mobilePreview, setMobilePreview] = useState<string | null>(null);

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    const desktopInputRef = useRef<HTMLInputElement>(null);
    const mobileInputRef = useRef<HTMLInputElement>(null);

    const handleDesktopChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const file = e.target.files?.[0];
        if (!file) return;
        const err = validateFile(file);
        if (err) {
            setErrors(prev => ({ ...prev, desktopFile: err }));
            return;
        }
        setErrors(prev => ({ ...prev, desktopFile: undefined }));
        setDesktopFile(file);
        setDesktopPreview(URL.createObjectURL(file));
    };

    const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const file = e.target.files?.[0];
        if (!file) return;
        const err = validateFile(file);
        if (err) {
            setErrors(prev => ({ ...prev, mobileFile: err }));
            return;
        }
        setErrors(prev => ({ ...prev, mobileFile: undefined }));
        setMobileFile(file);
        setMobilePreview(URL.createObjectURL(file));
    };

    const validate = (): boolean => {
        const newErrors: FormErrors = {};
        if (!title.trim() || title.trim().length > 60) {
            newErrors.title = "Título requerido (máx 60 caracteres)";
        }
        if (!link.trim() || (!link.startsWith("/") && !link.startsWith("http"))) {
            newErrors.link = "El enlace debe empezar con / o http";
        }
        if (!desktopFile) {
            newErrors.desktopFile = "La imagen desktop es requerida";
        }
        if (endDate && startDate && endDate <= startDate) {
            newErrors.endDate = "La fecha de fin debe ser posterior a la de inicio";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const uploadFile = async (file: File, folder: string): Promise<string> => {
        const ext = file.name.split(".").pop();
        const fileName = `${folder}/${Math.random().toString(36).substring(2, 15)}.${ext}`;
        const { error } = await supabase.storage.from("banners").upload(fileName, file);
        if (error) throw new Error(`Error al subir ${folder}: ${error.message}`);
        const { data } = supabase.storage.from("banners").getPublicUrl(fileName);
        return data.publicUrl;
    };

    const handleSubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        if (!validate()) return;

        setIsSubmitting(true);
        toast.loading("Subiendo banner...", { id: "banner-upload" });

        try {
            const desktopUrl = await uploadFile(desktopFile!, "desktop");
            let mobileUrl: string | null = null;
            if (mobileFile) {
                mobileUrl = await uploadFile(mobileFile, "mobile");
            }

            const { error: dbError } = await supabase.from("banners").insert({
                desktop_image_url: desktopUrl,
                image_url: desktopUrl, // backward compat — keep legacy column in sync
                mobile_image_url: mobileUrl,
                title: title.trim(),
                link: link.trim(),
                start_date: new Date(startDate).toISOString(),
                end_date: endDate ? new Date(endDate).toISOString() : null,
                is_active: true,
                display_order: bannersCount,
            });

            if (dbError) {
                console.error("Supabase Insert Error (Banners):", dbError);
                toast.error(`Error DB: ${dbError.message}`, { id: "banner-upload" });
                return;
            }

            toast.success("Banner creado correctamente", { id: "banner-upload" });
            onSuccess();
        } catch (err) {
            console.error("Banner upload error:", err);
            toast.error(err instanceof Error ? err.message : "Error al subir el banner", { id: "banner-upload" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 shrink-0">
                    <h2 className="text-lg font-bold text-zinc-900">Nuevo Banner</h2>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
                    <div className="p-6 space-y-5">
                        {/* Título + Link */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-zinc-700 mb-1">
                                    Título <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    maxLength={60}
                                    placeholder="Ej: Nueva Colección Verano"
                                    disabled={isSubmitting}
                                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition disabled:opacity-50"
                                />
                                {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
                                <p className="mt-1 text-xs text-zinc-400">{title.length}/60</p>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-zinc-700 mb-1">
                                    Link de destino <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={link}
                                    onChange={(e) => setLink(e.target.value)}
                                    placeholder="Ej: /catalogo o https://..."
                                    disabled={isSubmitting}
                                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition disabled:opacity-50"
                                />
                                {errors.link && <p className="mt-1 text-xs text-red-600">{errors.link}</p>}
                            </div>
                        </div>

                        {/* Fechas */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-zinc-700 mb-1">
                                    Fecha de inicio
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    disabled={isSubmitting}
                                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition disabled:opacity-50"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-zinc-700 mb-1">
                                    Fecha de fin <span className="text-zinc-400 font-normal">(opcional)</span>
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    disabled={isSubmitting}
                                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition disabled:opacity-50"
                                />
                                {errors.endDate && <p className="mt-1 text-xs text-red-600">{errors.endDate}</p>}
                            </div>
                        </div>

                        {/* Image Uploads */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Desktop */}
                            <div>
                                <label className="block text-sm font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
                                    <Monitor className="w-4 h-4" />
                                    Imagen Desktop <span className="text-red-500">*</span>
                                </label>
                                <p className="text-xs text-zinc-400 mb-2">1920×800px (21:9) · JPG/PNG/WebP/GIF · Máx 2MB</p>
                                <div
                                    onClick={() => !isSubmitting && desktopInputRef.current?.click()}
                                    className={`relative aspect-[21/9] rounded-xl overflow-hidden border-2 transition cursor-pointer group ${desktopFile ? "border-zinc-300" : "border-dashed border-zinc-300 hover:border-zinc-500"}`}
                                >
                                    {desktopPreview ? (
                                        <>
                                            <img src={desktopPreview} alt="Vista previa desktop" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                                <p className="text-white text-xs font-bold">Cambiar imagen</p>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50 text-zinc-400">
                                            <Upload className="w-6 h-6 mb-1" />
                                            <p className="text-xs font-medium">Vista Previa</p>
                                            <p className="text-xs">Haz clic para subir</p>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={desktopInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    className="hidden"
                                    onChange={handleDesktopChange}
                                    disabled={isSubmitting}
                                />
                                {errors.desktopFile && <p className="mt-1 text-xs text-red-600">{errors.desktopFile}</p>}
                            </div>

                            {/* Mobile */}
                            <div>
                                <label className="block text-sm font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
                                    <Smartphone className="w-4 h-4" />
                                    Imagen Mobile <span className="text-zinc-400 font-normal">(opcional)</span>
                                </label>
                                <p className="text-xs text-zinc-400 mb-2">800×1200px (2:3) · JPG/PNG/WebP/GIF · Máx 2MB</p>
                                <div
                                    onClick={() => !isSubmitting && mobileInputRef.current?.click()}
                                    className={`relative aspect-[21/9] rounded-xl overflow-hidden border-2 transition cursor-pointer group ${mobileFile ? "border-zinc-300" : "border-dashed border-zinc-300 hover:border-zinc-500"}`}
                                >
                                    {mobilePreview ? (
                                        <>
                                            <img src={mobilePreview} alt="Vista previa mobile" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                                <p className="text-white text-xs font-bold">Cambiar imagen</p>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-50 text-zinc-400">
                                            <Upload className="w-6 h-6 mb-1" />
                                            <p className="text-xs font-medium">Vista Previa</p>
                                            <p className="text-xs">Haz clic para subir</p>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={mobileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    className="hidden"
                                    onChange={handleMobileChange}
                                    disabled={isSubmitting}
                                />
                                {errors.mobileFile && <p className="mt-1 text-xs text-red-600">{errors.mobileFile}</p>}
                                {!mobileFile && (
                                    <p className="mt-1 text-xs text-zinc-400">Si no se sube, se usará la imagen desktop como fallback.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-zinc-200 flex justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!desktopFile || isSubmitting}
                            className="px-6 py-2.5 text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Subiendo...
                                </>
                            ) : (
                                "Crear Banner"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
