#!/usr/bin/env node

const { fetchAllPatients, config } = require("./fetch-patients");
const { analyzePatients } = require("./risk-scoring");

async function main() {
  const patients = await fetchAllPatients(config);
  const analysis = analyzePatients(patients);
  const payload = {
    high_risk_patients: analysis.highRiskPatients,
    fever_patients: analysis.feverPatients,
    data_quality_issues: analysis.dataQualityIssues,
  };
  console.log("Payload", payload);
  const response = await fetch(`${config.baseUrl}/submit-assessment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify(payload),
  });
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(
      `Submit failed with status ${response.status}: ${typeof result === "string" ? result : JSON.stringify(result)}`
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
