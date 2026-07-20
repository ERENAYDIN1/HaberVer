import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { useCreateAsset } from "../hooks/useAssets";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
} from "../types/asset";
import type { AssetStatus, AssetType } from "../types/asset";

interface AssetFormValues {
  name: string;
  type: AssetType;
  status: AssetStatus;
  longitude: number;
  latitude: number;
  install_date: string;
  brand_model: string;
}

interface AssetFormProps {
  /** Harita tiklamasiyla gelen koordinat (Faz 6'da baglanacak). */
  koordinat?: { longitude: number; latitude: number };
}

const bosDeger: AssetFormValues = {
  name: "",
  type: "agac",
  status: "iyi",
  longitude: "" as unknown as number,
  latitude: "" as unknown as number,
  install_date: "",
  brand_model: "",
};

const inputClass =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";
const errorClass = "mt-1 text-xs text-red-600";

export default function AssetForm({ koordinat }: AssetFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AssetFormValues>({ defaultValues: bosDeger });

  const createAsset = useCreateAsset();

  // Haritadan koordinat gelirse ilgili alanlari doldur.
  useEffect(() => {
    if (koordinat) {
      setValue("longitude", koordinat.longitude, { shouldValidate: true });
      setValue("latitude", koordinat.latitude, { shouldValidate: true });
    }
  }, [koordinat, setValue]);

  const onSubmit = handleSubmit((values) => {
    createAsset.mutate(
      {
        name: values.name.trim(),
        type: values.type,
        status: values.status,
        longitude: Number(values.longitude),
        latitude: Number(values.latitude),
        install_date: values.install_date || null,
        brand_model: values.brand_model.trim() || null,
      },
      { onSuccess: () => reset(bosDeger) }
    );
  });

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      noValidate
    >
      <h2 className="text-lg font-semibold text-slate-800">Varlık Ekle</h2>

      <div>
        <label className={labelClass} htmlFor="name">
          İsim <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          className={inputClass}
          placeholder="Örn. Kuğulu Park Çınarı"
          {...register("name", {
            required: "İsim boş olamaz",
            maxLength: { value: 255, message: "İsim en fazla 255 karakter olabilir" },
            validate: (v) => v.trim().length > 0 || "İsim boş olamaz",
          })}
        />
        {errors.name && <p className={errorClass}>{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="type">
            Tip
          </label>
          <select id="type" className={inputClass} {...register("type")}>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="status">
            Durum
          </label>
          <select id="status" className={inputClass} {...register("status")}>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="longitude">
            Boylam (longitude) <span className="text-red-500">*</span>
          </label>
          <input
            id="longitude"
            className={inputClass}
            placeholder="32.8597"
            {...register("longitude", {
              required: "Boylam zorunludur",
              valueAsNumber: true,
              validate: (v) =>
                (!Number.isNaN(v) && v >= -180 && v <= 180) ||
                "Boylam -180 ile 180 arasında bir sayı olmalı",
            })}
          />
          {errors.longitude && (
            <p className={errorClass}>{errors.longitude.message}</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="latitude">
            Enlem (latitude) <span className="text-red-500">*</span>
          </label>
          <input
            id="latitude"
            className={inputClass}
            placeholder="39.9334"
            {...register("latitude", {
              required: "Enlem zorunludur",
              valueAsNumber: true,
              validate: (v) =>
                (!Number.isNaN(v) && v >= -90 && v <= 90) ||
                "Enlem -90 ile 90 arasında bir sayı olmalı",
            })}
          />
          {errors.latitude && (
            <p className={errorClass}>{errors.latitude.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="install_date">
            Kurulum Tarihi
          </label>
          <input
            id="install_date"
            type="date"
            className={inputClass}
            {...register("install_date")}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="brand_model">
            Marka / Model
          </label>
          <input
            id="brand_model"
            className={inputClass}
            placeholder="Örn. Platanus orientalis"
            {...register("brand_model")}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={createAsset.isPending}
        className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {createAsset.isPending ? "Kaydediliyor..." : "Kaydet"}
      </button>

      {createAsset.isError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {createAsset.error.message}
        </p>
      )}
      {createAsset.isSuccess && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Varlık eklendi.
        </p>
      )}
    </form>
  );
}
