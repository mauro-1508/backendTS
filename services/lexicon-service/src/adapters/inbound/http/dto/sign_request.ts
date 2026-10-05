import { ResourceType } from '../../../../domain/entity';
import { CreateSignInput, UpdateSignInput } from '../../../../ports/inbound/lexicon_service';

/** El cuerpo no trae `status`: toda seña nace en DRAFT y se publica con POST /:code/publish. */
export type CreateSignRequestDto = CreateSignInput;

/** No cambia `code` ni `status`. */
export type UpdateSignRequestDto = UpdateSignInput;

export interface LocalizationRequestDto {
  name?: string;
  meaning?: string | null;
  description?: string | null;
}

export interface CategoryRequestDto {
  name?: string;
  description?: string | null;
}

export interface AddResourceRequestDto {
  type: ResourceType;
  url: string;
  mimeType?: string | null;
  displayOrder?: number;
  description?: string | null;
}
