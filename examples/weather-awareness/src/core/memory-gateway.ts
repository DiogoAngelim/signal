import type { CalibrationInsight, MemoryGateway, SimilarityInsight } from "./types";

export const EMPTY_SIMILARITY: SimilarityInsight = {
  similarCases: [],
  outcomeDistribution: {},
  lessonReferences: []
};

export const EMPTY_CALIBRATION: CalibrationInsight = {
  confidenceAccuracy: 0,
  overconfidence: false,
  underconfidence: false,
  historicalCalibration: {
    sampleSize: 0,
    averageCalibrationScore: 0,
    reliabilityTrend: "insufficient-data"
  }
};

export function createUnavailableMemoryGateway(): MemoryGateway {
  return {
    async recordDecision() {
      return undefined;
    },
    async querySimilarity() {
      return EMPTY_SIMILARITY;
    },
    async queryCalibration() {
      return EMPTY_CALIBRATION;
    }
  };
}
