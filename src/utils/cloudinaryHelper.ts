import cloudinaryLib from '../config/claudinary';

export class CloudinaryHelper {
  /**
 * Upload file to Cloudinary
 */
static async uploadFile(
  filePath: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
  folder: string = 'uploads'
): Promise<{ secure_url: string; public_id: string }> {
  try {
    const result = await cloudinaryLib.uploader.upload(filePath, {
      resource_type: resourceType,
      folder,
    });

    console.log(`✅ File uploaded to Cloudinary: ${result.public_id}`);

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    throw error;
  }
}

  /**
   * Delete file from Cloudinary
   */
  static async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<void> {
    try {
      await cloudinaryLib.uploader.destroy(publicId, { resource_type: resourceType });
      console.log(`✅ File deleted from Cloudinary: ${publicId}`);
    } catch (error) {
      console.error(`❌ Error deleting file from Cloudinary:`, error);
      throw error;
    }
  }

  /**
   * Delete multiple files from Cloudinary
   */
  static async deleteMultipleFiles(publicIds: string[], resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<void> {
    try {
      await cloudinaryLib.api.delete_resources(publicIds, { resource_type: resourceType });
      console.log(`✅ ${publicIds.length} files deleted from Cloudinary`);
    } catch (error) {
      console.error(`❌ Error deleting multiple files from Cloudinary:`, error);
      throw error;
    }
  }

  /**
   * Delete folder from Cloudinary
   */
  static async deleteFolder(folderPath: string): Promise<void> {
    try {
      await cloudinaryLib.api.delete_folder(folderPath);
      console.log(`✅ Folder deleted from Cloudinary: ${folderPath}`);
    } catch (error) {
      console.error(`❌ Error deleting folder from Cloudinary:`, error);
      throw error;
    }
  }

  /**
   * Get file details from Cloudinary
   */
  static async getFileDetails(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<any> {
    try {
      const result = await cloudinaryLib.api.resource(publicId, { resource_type: resourceType });
      return result;
    } catch (error) {
      console.error(`❌ Error getting file details from Cloudinary:`, error);
      throw error;
    }
  }

  /**
   * Extract public ID from Cloudinary URL
   */
  static extractPublicId(url: string): string | null {
    const regex = /\/v\d+\/(.+)\.[a-z]{3,4}$/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Get optimized image URL
   */
  static getOptimizedImageUrl(publicId: string, options?: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: string | number;
    format?: string;
  }): string {
    return cloudinaryLib.url(publicId, {
      width: options?.width || 800,
      height: options?.height,
      crop: options?.crop || 'limit',
      quality: options?.quality || 'auto',
      format: options?.format || 'auto',
      fetch_format: 'auto',
    });
  }

  /**
   * Generate thumbnail URL
   */
  static getThumbnailUrl(publicId: string, width: number = 200, height: number = 200): string {
    return cloudinaryLib.url(publicId, {
      width,
      height,
      crop: 'fill',
      quality: 'auto',
      format: 'auto',
    });
  }

  /**
   * Get video thumbnail
   */
  static getVideoThumbnail(publicId: string): string {
    return cloudinaryLib.url(publicId, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [
        { width: 640, height: 360, crop: 'fill' },
        { quality: 'auto' },
      ],
    });
  }
}