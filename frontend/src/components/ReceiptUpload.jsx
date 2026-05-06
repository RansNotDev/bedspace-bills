import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { uploadReceipt, uploadReceiptPublic } from '../utils/api';

export default function ReceiptUpload({ tenantBillId, token, onUploaded, existingReceipt }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(existingReceipt || null);
  const fileRef = useRef();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(file);
    }

    setUploading(true);
    try {
      let res;
      if (token) {
        // Public upload via payment link
        res = await uploadReceiptPublic(token, file);
      } else if (tenantBillId) {
        // Authenticated upload
        res = await uploadReceipt(tenantBillId, file);
      }

      toast.success('Receipt uploaded successfully!');
      if (onUploaded) onUploaded(res.data.receiptImage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
      setPreview(existingReceipt || null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {preview ? (
        <div className="space-y-3">
          <div className="relative inline-block">
            <img
              src={preview}
              alt="Payment receipt"
              className="w-full max-w-xs rounded-lg border border-gray-200 shadow-sm"
            />
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-xs"
              title="View full size"
            >
              🔍
            </a>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-secondary text-sm"
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : '🔄 Replace Receipt'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-xl p-8 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
        >
          {uploading ? (
            <span className="text-blue-600 text-sm">Uploading...</span>
          ) : (
            <>
              <span className="text-3xl mb-2">📸</span>
              <span className="text-sm font-medium text-gray-700">Upload Payment Receipt</span>
              <span className="text-xs text-gray-400 mt-1">JPG, PNG, or PDF (max 10MB)</span>
            </>
          )}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
