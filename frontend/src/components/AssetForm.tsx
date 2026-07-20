import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { useCreateAsset, useUpdateAsset } from "../hooks/useAssets";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
} from "../types/asset";
import type { AssetFeature, AssetStatus, AssetType } from "../types/asset";

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
  /** Verilirse form duzenleme modunda calisir. */
  asset?: AssetFeature;
  /** Kaydetme basarili olunca cagrilir (ornegin modali kapatmak icin). */
  onDone?: () => void;
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

function assetToValues(asset: AssetFeature): AssetFormValues {
  const { properties, geometry } = asset;
  return {
    name: properties.name,
    type: properties.type,
    status: properties.status,
    longitude: geometry.coordinates[0],
    latitude: geometry.coordinates[1],
    install_date: properties.install_date ?? "",
    brand_model: properties.brand_model ?? "",
  };
}

const inputClass =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";
const errorClass = "mt-1 text-xs text-red-600";

export default function AssetForm({ koordinat, asset, onDone }: AssetFormProps) {
  const duzenlemeModu = asset !== undefined;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AssetFormValues>({
    defaultValues: asset ? assetToValues(asset) : bosDeger,
  });

  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const mutation = duzenlemeModu ? updateAsset : createAsset;

  // Haritadan koordinat gelirse ilgili alanlari doldur.
  useEffect(() => {
    if (koordinat) {
      setValue("longitude", koordinat.longitude, { shouldValidate: true });
      setValue("latitude", koordinat.latitude, { shouldValidate: true });
    }
  }, [koordinat, setValue]);

  const onSubmit = handleSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      type: values.type,
      status: values.status,
      longitude: Number(values.longitude),
      latitude: Number(values.latitude),
      install_date: values.install_date || null,
      brand_model: values.brand_model.trim() || null,
    };

    if (duzenlemeModu) {
      updateAsset.mutate(
        { id: asset.properties.id, data: payload },
        { onSuccess: () => onDone?.() }
      );
    } else {
      createAsset.mutate(payload, {
        onSuccess: () => {
          reset(bosDeger);
          onDone?.();
        },
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
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

      <div className="flex gap-2">
        {duzenlemeModu && (
          <button
            type="button"
            onClick={onDone}
            className="flex-1 rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Vazgeç
          </button>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex-1 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {mutation.isPending
            ? "Kaydediliyor..."
            : duzenlemeModu
              ? "Güncelle"
              : "Kaydet"}
        </button>
      </div>

      {mutation.isError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {mutation.error.message}
        </p>
      )}
      {!duzenlemeModu && createAsset.isSuccess && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Varlık eklendi.
        </p>
      )}
    </form>
  );
}
