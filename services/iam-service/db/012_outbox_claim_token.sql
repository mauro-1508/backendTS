-- Un worker cuya reserva venció no puede confirmar ni reprogramar una reserva nueva.
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS claim_token UUID;
