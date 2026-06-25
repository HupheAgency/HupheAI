ALTER TABLE provider_runs DROP CONSTRAINT provider_runs_provider_type_check;
ALTER TABLE provider_runs ADD CONSTRAINT provider_runs_provider_type_check
  CHECK (provider_type IN (
    'reference-view', 'reconstruction', 'final-render', 'analysis', 'angle-variant'
  ));
