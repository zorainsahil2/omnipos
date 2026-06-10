import React, { useState, useEffect, useRef } from 'react';
import { uploadProductImage, deleteProductImage } from '../lib/imageApi';

/**
 * ProductImageUploader
 * Props:
 *   productId: string (required for upload path)
 *   currentImageUrl: string | null
 *   onImageChange: (newUrl: string | null) => void
 *   tenantId: string
 */
export const ProductImageUploader = ({ productId, currentImageUrl, onImageChange, tenantId }) => {
  const [preview, setPreview]   = useState(currentImageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError]       = useState(null);
  const fileInputRef = useRef(null);

  // Keep preview in sync with prop if it changes externally
  useEffect(() => {
    setPreview(currentImageUrl);
  }, [currentImageUrl]);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Client-side validations
    if (file.size > 2 * 1024 * 1024) {
      setError('Image is larger than 2MB. Please use a smaller image.');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, PNG, or WebP formats are allowed.');
      return;
    }

    // Instant preview (before upload)
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      // Step-by-step progress simulation during canvas processing & upload
      setUploadProgress(30);
      const publicUrl = await uploadProductImage(file, tenantId, productId);
      setUploadProgress(100);
      setPreview(publicUrl);
      onImageChange(publicUrl);
    } catch (err) {
      console.error('[ProductImageUploader] Upload failed:', err);
      setError('Upload failed. Please try again.');
      setPreview(currentImageUrl); // Revert to original
      onImageChange(currentImageUrl);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset file input
      }
    }
  };

  const handleRemove = async (e) => {
    e.stopPropagation();
    if (!preview) return;

    setUploading(true);
    try {
      await deleteProductImage(preview, tenantId, productId);
      setPreview(null);
      setError(null);
      onImageChange(null);
    } catch (err) {
      console.error('[ProductImageUploader] Delete failed:', err);
      setError('Failed to remove image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="img-uploader-container">
      <div 
        className={`img-uploader-box ${error ? 'has-error' : ''}`}
        onClick={triggerFileSelect}
        role="button"
        tabIndex={0}
        aria-label="Upload product image"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') triggerFileSelect(); }}
      >
        {preview ? (
          <img src={preview} alt="Product preview" />
        ) : (
          <div className="img-uploader-placeholder">
            <span className="img-uploader-icon">📷</span>
            <span className="img-uploader-text">Upload Image</span>
          </div>
        )}

        {uploading && (
          <div className="img-upload-overlay">
            <div className="img-spinner"></div>
            <span>{uploadProgress}%</span>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
      />

      <div className="img-uploader-actions">
        {preview && !uploading && (
          <>
            <button 
              type="button" 
              className="img-btn img-btn-change" 
              onClick={triggerFileSelect}
            >
              📷 Change
            </button>
            <button 
              type="button" 
              className="img-btn img-btn-remove" 
              onClick={handleRemove}
            >
              🗑️ Remove
            </button>
          </>
        )}
      </div>

      {error && <div className="img-uploader-error-msg">{error}</div>}
    </div>
  );
};
