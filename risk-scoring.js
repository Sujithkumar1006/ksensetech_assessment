function getBloodPressureRisk(bloodPressure) {
  if (
    bloodPressure === null ||
    bloodPressure === undefined ||
    bloodPressure === ""
  ) {
    return { score: 0, invalid: true };
  }

  const parts = String(bloodPressure).split("/");

  if (parts.length !== 2) {
    return { score: 0, invalid: true };
  }

  const systolicText = parts[0].trim();
  const diastolicText = parts[1].trim();

  if (!systolicText || !diastolicText) {
    return { score: 0, invalid: true };
  }

  const systolic = Number(systolicText);
  const diastolic = Number(diastolicText);

  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
    return { score: 0, invalid: true };
  }

  if (systolic >= 140 || diastolic >= 90) {
    return { score: 3, invalid: false };
  }

  if (
    (systolic >= 130 && systolic <= 139) ||
    (diastolic >= 80 && diastolic <= 89)
  ) {
    return { score: 2, invalid: false };
  }

  if (systolic >= 120 && systolic <= 129 && diastolic < 80) {
    return { score: 1, invalid: false };
  }

  if (systolic < 120 && diastolic < 80) {
    return { score: 0, invalid: false };
  }

  return { score: 0, invalid: true };
}

function getTemperatureRisk(temperature) {
  if (
    temperature === null ||
    temperature === undefined ||
    temperature === ""
  ) {
    return { score: 0, invalid: true };
  }

  const value = Number(temperature);

  if (!Number.isFinite(value)) {
    return { score: 0, invalid: true };
  }

  if (value >= 101.0) {
    return { score: 2, invalid: false };
  }

  if (value >= 99.6 && value <= 100.9) {
    return { score: 1, invalid: false };
  }

  if (value <= 99.5) {
    return { score: 0, invalid: false };
  }

  return { score: 0, invalid: true };
}

function getAgeRisk(age) {
  if (age === null || age === undefined || age === "") {
    return { score: 0, invalid: true };
  }

  const value = Number(age);

  if (!Number.isFinite(value)) {
    return { score: 0, invalid: true };
  }

  if (value > 65) {
    return { score: 2, invalid: false };
  }

  if (value >= 40 && value <= 65) {
    return { score: 1, invalid: false };
  }

  if (value < 40) {
    return { score: 0, invalid: false };
  }

  return { score: 0, invalid: true };
}

function scorePatient(patient) {
  const bloodPressureRisk = getBloodPressureRisk(patient.blood_pressure);
  const temperatureRisk = getTemperatureRisk(patient.temperature);
  const ageRisk = getAgeRisk(patient.age);
  const totalRiskScore =
    bloodPressureRisk.score + temperatureRisk.score + ageRisk.score;
  const hasDataQualityIssue =
    bloodPressureRisk.invalid || temperatureRisk.invalid || ageRisk.invalid;

  return {
    patient_id: patient.patient_id,
    bpScore: bloodPressureRisk.score,
    tempScore: temperatureRisk.score,
    ageScore: ageRisk.score,
    totalRiskScore,
    hasDataQualityIssue,
  };
}

function analyzePatients(patients) {
  const scoredPatients = [];
  const highRiskPatients = [];
  const feverPatients = [];
  const dataQualityIssues = [];

  for (const patient of patients) {
    const result = scorePatient(patient);
    scoredPatients.push(result);

    if (result.totalRiskScore >= 4) {
      highRiskPatients.push(patient.patient_id);
    }

    if (
      patient.temperature !== null &&
      patient.temperature !== undefined &&
      patient.temperature !== "" &&
      Number.isFinite(Number(patient.temperature)) &&
      Number(patient.temperature) >= 99.6
    ) {
      feverPatients.push(patient.patient_id);
    }

    if (result.hasDataQualityIssue) {
      dataQualityIssues.push(patient.patient_id);
    }
  }

  return {
    scoredPatients,
    highRiskPatients,
    feverPatients,
    dataQualityIssues,
  };
}

module.exports = {
  getBloodPressureRisk,
  getTemperatureRisk,
  getAgeRisk,
  scorePatient,
  analyzePatients,
};
