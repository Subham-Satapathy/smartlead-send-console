import { columnSizingFeature, tableFeatures } from '@tanstack/react-table'

/**
 * The feature set shared by every table in the app. Defined once, statically,
 * so `useTable` and `createColumnHelper` calls elsewhere can share the same
 * `TableFeatureSet` type. Only column sizing is registered — sorting,
 * filtering, and pagination are handled server-side via query params, not
 * through TanStack Table's row models.
 */
export const tableFeatureSet = tableFeatures({ columnSizingFeature })
export type TableFeatureSet = typeof tableFeatureSet
