import { randomUUID } from 'node:crypto';
import { Collection, Document } from 'mongodb';
import { GestureSample } from '../../../domain/entity';
import { SampleRepository } from '../../../ports/outbound/sample_repository';

export const GESTURE_SAMPLES_COLLECTION = 'gesture_samples';

/** Documento Mongo: `_id` es el sampleId. */
export interface SampleDocument extends Document {
  _id: string;
  sign_code: string;
  capture_session_id: string;
  recorded_by: number;
  performed_by: string;
  consent_granted_at: Date;
  consent_terms_version: string;
  sample_type: 'LANDMARKS';
  frames: number[][];
  is_validated: boolean;
  created_at: Date;
}

const toSample = (doc: SampleDocument): GestureSample => ({
  sampleId: doc._id,
  signCode: doc.sign_code,
  captureSessionId: doc.capture_session_id,
  recordedBy: doc.recorded_by,
  performedBy: doc.performed_by,
  consentGrantedAt: doc.consent_granted_at,
  consentTermsVersion: doc.consent_terms_version,
  frames: doc.frames,
  isValidated: doc.is_validated,
  createdAt: doc.created_at,
});

export const makeMongoSampleRepository = (collection: Collection<SampleDocument>): SampleRepository => ({
  create: async sample => {
    const doc: SampleDocument = {
      _id: randomUUID(),
      sign_code: sample.signCode,
      capture_session_id: sample.captureSessionId,
      recorded_by: sample.recordedBy,
      performed_by: sample.performedBy,
      consent_granted_at: sample.consentGrantedAt,
      consent_terms_version: sample.consentTermsVersion,
      sample_type: 'LANDMARKS',
      frames: sample.frames,
      is_validated: false,
      created_at: new Date(),
    };
    await collection.insertOne(doc);
    return toSample(doc);
  },

  list: async ({ signCode }) => {
    const docs = await collection.find(signCode ? { sign_code: signCode } : {}).sort({ created_at: -1 }).toArray();
    return docs.map(toSample);
  },
});

/** Indices de la coleccion (06-data/domains/06-ai.md); createIndex es idempotente. */
export const ensureSampleIndexes = async (collection: Collection<SampleDocument>): Promise<void> => {
  await collection.createIndex({ sign_code: 1 }, { name: 'idx_samples_sign' });
  await collection.createIndex({ capture_session_id: 1 }, { name: 'idx_samples_session' });
};
