var api_base_url = "https://assessment.ksensetech.com/api";
var api_base_path = "/patients";
var api_submit_assessment_path = "/submit-assessment";
var api_header_key = "ak_d83de9da2cb3fb857dbfbda936af8414dd949d70089d3713";
var nextPageAvailable = true;

// Import Node.js modules
const https = require('https');
const { URL } = require('url');

let data = [];
let currentPage = 1;

/*
Get Patients api response example:
{
  "data": [
    {
      "patient_id": "DEMO001",
      "name": "TestPatient, John",
      "age": 45,
      "gender": "M",
      "blood_pressure": "120/80",
      "temperature": 98.6,
      "visit_date": "2024-01-15",
      "diagnosis": "Sample_Hypertension",
      "medications": "DemoMed_A 10mg, TestDrug_B 500mg"
    },
    {
      "patient_id": "DEMO002",
      "name": "AssessmentUser, Jane",
      "age": 67,
      "gender": "F",
      "blood_pressure": "140/90",
      "temperature": 99.2,
      "visit_date": "2024-01-16",
      "diagnosis": "Eval_Diabetes",
      "medications": "FakeMed 1000mg"
    },
    // ... more patients
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 50,
    "totalPages": 10,
    "hasNext": true,
    "hasPrevious": false
  },
  "metadata": {
    "timestamp": "2025-07-15T23:01:05.059Z",
    "version": "v1.0",
    requestId: "123"
  }
}
*/

//curl -X GET "https://assessment.ksensetech.com/api/patients?page=1&limit=10"
//  -H "x-api-key: your-api-key-here"

/*
Submit Assessment api response example:
  {
  "success": true,
  "message": "Assessment submitted successfully",
  "results": {
    "score": 91.94,
    "percentage": 92,
    "status": "PASS",
    "breakdown": {
      "high_risk": {
        "score": 48,
        "max": 50,
        "correct": 20,
        "submitted": 21,
        "matches": 20
      },
      "fever": {
        "score": 19,
        "max": 25,
        "correct": 9,
        "submitted": 7,
        "matches": 7
      },
      "data_quality": {
        "score": 25,
        "max": 25,
        "correct": 8,
        "submitted": 8,
        "matches": 8
      }
    },
    "feedback": {
      "strengths": [
        "✅ Data quality issues: Perfect score (8/8)"
      ],
      "issues": [
        "🔄 High-risk patients: 20/20 correct, but 1 incorrectly included",
        "🔄 Fever patients: 7/9 correct, but 2 missed"
      ]
    },
    "attempt_number": 1,
    "remaining_attempts": 2,
    "is_personal_best": true,
    "can_resubmit": true
  }
}
  */

function getPatients(page = 1, limit = 20) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${api_base_url}${api_base_path}`);
        url.searchParams.append('page', page);
        url.searchParams.append('limit', limit);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'x-api-key': api_header_key,
                'User-Agent': 'Node.js'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } else {
                        console.log(`API Error - Status: ${res.statusCode}, Response: ${data}`);
                        resolve(null);
                    }
                } catch (error) {
                    console.log(`JSON Parse Error: ${error.message}, Raw Data: ${data}`);
                    resolve(null);
                }
            });
        });
        
        req.on('error', (error) => {
            resolve(null);
        });
        
        req.end();
    });
}

// Helper function for delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Patient Risk Scoring System
function calculateBloodPressureRisk(bloodPressure) {
    if (!bloodPressure || typeof bloodPressure !== 'string') {
        return 0; // Invalid/Missing Data
    }
    
    const bpParts = bloodPressure.split('/');
    if (bpParts.length !== 2) {
        return 0; // Invalid format
    }
    
    const systolic = parseInt(bpParts[0].trim());
    const diastolic = parseInt(bpParts[1].trim());
    
    // Check for invalid numeric values
    if (isNaN(systolic) || isNaN(diastolic) || systolic <= 0 || diastolic <= 0) {
        return 0; // Invalid/Missing Data
    }
    
    // Determine risk category based on the higher risk reading
    // Normal (Systolic <120 AND Diastolic <80): 1 point
    if (systolic < 120 && diastolic < 80) {
        return 1;
    }
    
    // Elevated (Systolic 120‑129 AND Diastolic <80): 2 points
    if (systolic >= 120 && systolic <= 129 && diastolic < 80) {
        return 2;
    }
    
    // Stage 1 (Systolic 130‑139 OR Diastolic 80‑89): 3 points
    if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
        return 3;
    }
    
    // Stage 2 (Systolic ≥140 OR Diastolic ≥90): 4 points
    if (systolic >= 140 || diastolic >= 90) {
        return 4;
    }
    
    // Fallback to normal if none of the above conditions are met
    return 1;
}

function calculateTemperatureRisk(temperature) {
    if (!temperature || typeof temperature !== 'number') {
        // Try to convert if it's a string number
        if (typeof temperature === 'string') {
            const tempNum = parseFloat(temperature);
            if (isNaN(tempNum)) {
                return 0; // Invalid/Missing Data
            }
            temperature = tempNum;
        } else {
            return 0; // Invalid/Missing Data
        }
    }
    
    if (temperature <= 99.5) return 0; // Normal
    else if (temperature >= 99.6 && temperature <= 100.9) return 1; // Low Fever
    else if (temperature >= 101.0) return 2; // High Fever
    
    return 0; // Default case
}

function calculateAgeRisk(age) {
    if (!age || typeof age !== 'number') {
        // Try to convert if it's a string number
        if (typeof age === 'string') {
            const ageNum = parseInt(age);
            if (isNaN(ageNum)) {
                return 0; // Invalid/Missing Data
            }
            age = ageNum;
        } else {
            return 0; // Invalid/Missing Data
        }
    }
    
    if (age < 40) return 1; // Under 40
    else if (age >= 40 && age <= 65) return 1; // 40-65
    else if (age > 65) return 2; // Over 65
    
    return 0; // Default case
}

function calculatePatientRiskScore(patient) {
    const bpRisk = calculateBloodPressureRisk(patient.blood_pressure);
    const tempRisk = calculateTemperatureRisk(patient.temperature);
    const ageRisk = calculateAgeRisk(patient.age);
    
    const totalRisk = bpRisk + tempRisk + ageRisk;
    
    // Check for data quality issues
    const hasDataIssues = checkDataQualityIssues(patient);
    
    return {
        patient_id: patient.patient_id,
        name: patient.name,
        bloodPressureRisk: bpRisk,
        temperatureRisk: tempRisk,
        ageRisk: ageRisk,
        totalRiskScore: totalRisk,
        riskLevel: totalRisk <= 2 ? 'Low' : totalRisk <= 4 ? 'Medium' : 'High',
        hasDataIssues: hasDataIssues,
        originalData: {
            blood_pressure: patient.blood_pressure,
            temperature: patient.temperature,
            age: patient.age
        }
    };
}

// Function to check for data quality issues
function checkDataQualityIssues(patient) {
    const issues = [];
    
    // Check blood pressure issues
    if (!patient.blood_pressure || typeof patient.blood_pressure !== 'string') {
        issues.push('BP_MISSING');
    } else {
        const bpParts = patient.blood_pressure.split('/');
        if (bpParts.length !== 2) {
            issues.push('BP_MALFORMED');
        } else {
            const systolic = parseInt(bpParts[0].trim());
            const diastolic = parseInt(bpParts[1].trim());
            if (isNaN(systolic) || isNaN(diastolic) || systolic <= 0 || diastolic <= 0) {
                issues.push('BP_INVALID');
            }
        }
    }
    
    // Check temperature issues
    if (!patient.temperature) {
        issues.push('TEMP_MISSING');
    } else {
        let tempNum = patient.temperature;
        if (typeof patient.temperature === 'string') {
            tempNum = parseFloat(patient.temperature);
        }
        if (isNaN(tempNum)) {
            issues.push('TEMP_INVALID');
        }
    }
    
    // Check age issues
    if (!patient.age) {
        issues.push('AGE_MISSING');
    } else {
        let ageNum = patient.age;
        if (typeof patient.age === 'string') {
            ageNum = parseInt(patient.age);
        }
        if (isNaN(ageNum)) {
            issues.push('AGE_INVALID');
        }
    }
    
    return issues;
}

// Function to generate alert lists
function generateAlertLists(patientsWithRisk) {
    const alerts = {
        highRiskPatients: [],
        feverPatients: [],
        dataQualityIssues: []
    };
    
    patientsWithRisk.forEach(patient => {
        // High-Risk Patients: total risk score ≥ 4 (back to original requirement)
        if (patient.totalRiskScore >= 4) {
            alerts.highRiskPatients.push({
                patient_id: patient.patient_id,
                name: patient.name,
                totalRiskScore: patient.totalRiskScore
            });
        }
        
        // Fever Patients: temperature ≥ 99.6°F
        let temp = patient.originalData.temperature;
        if (typeof temp === 'string') {
            temp = parseFloat(temp);
        }
        if (!isNaN(temp) && temp >= 99.6) {
            alerts.feverPatients.push({
                patient_id: patient.patient_id,
                name: patient.name,
                temperature: patient.originalData.temperature
            });
        }
        
        // Data Quality Issues: patients with invalid/missing data
        if (patient.hasDataIssues.length > 0) {
            alerts.dataQualityIssues.push({
                patient_id: patient.patient_id,
                name: patient.name,
                issues: patient.hasDataIssues,
                data: patient.originalData
            });
        }
    });
    
    return alerts;
}

// Main async function to fetch all patients
async function fetchAllPatients() {
    // Reset global variables to ensure fresh start
    data = [];
    currentPage = 1;
    nextPageAvailable = true;
    
    console.log("Starting patient data fetch...");
    
    while(nextPageAvailable) {
        try {
            console.log(`Fetching page ${currentPage}...`);
            const response = await getPatients(currentPage);
            
            if (response && response.data && response.data.length > 0) {
                console.log(`Page ${currentPage}: ${response.data.length} patients`);
                data = data.concat(response.data);
                nextPageAvailable = response.pagination.hasNext;
                console.log(`Total so far: ${data.length}, hasNext: ${response.pagination.hasNext}`);
                currentPage++;
                
                if (nextPageAvailable) {
                    await delay(1000); // Wait 1 second before next request
                }
            } else {
                console.log("API response:", response);
                console.log("No more data available");
                nextPageAvailable = false;
            }
        } catch (error) {
            console.log("Error fetching data:", error.message);
            nextPageAvailable = false;
        }
    }
    
    console.log(`Total patients fetched: ${data.length}`);
    return data;
}

// Execute the main function
fetchAllPatients().then(allPatients => {
    // Calculate risk scores for all patients
    const patientsWithRisk = allPatients.map(patient => calculatePatientRiskScore(patient));
    
    // Debug: Show detailed scoring for analysis
    console.log("=== DETAILED PATIENT ANALYSIS ===");
    patientsWithRisk.forEach(patient => {
        const isHighRisk = patient.totalRiskScore >= 4;
        const hasFever = patient.originalData.temperature >= 99.6;
        const hasDataIssues = patient.hasDataIssues.length > 0;
        
        if (isHighRisk || hasFever || hasDataIssues) {
            console.log(`${patient.patient_id}: BP=${patient.bloodPressureRisk} Temp=${patient.temperatureRisk} Age=${patient.ageRisk} Total=${patient.totalRiskScore} ${isHighRisk ? 'HIGH-RISK' : ''} ${hasFever ? 'FEVER' : ''} ${hasDataIssues ? 'DATA-ISSUES' : ''}`);
        }
    });
    
    // Generate alert lists
    const alerts = generateAlertLists(patientsWithRisk);
    
    // Extract patient IDs for required format
    const high_risk_patients = alerts.highRiskPatients.map(p => p.patient_id);
    const fever_patients = alerts.feverPatients.map(p => p.patient_id);
    const data_quality_issues = alerts.dataQualityIssues.map(p => p.patient_id);
    
    // Display summary
    console.log("\n=== PATIENT ALERT SUMMARY ===");
    console.log("high_risk_patients:", JSON.stringify(high_risk_patients));
    console.log("fever_patients:", JSON.stringify(fever_patients));
    console.log("data_quality_issues:", JSON.stringify(data_quality_issues));
    console.log(`\nTotal Patients: ${allPatients.length} | High-Risk: ${high_risk_patients.length} | Fever: ${fever_patients.length} | Data Issues: ${data_quality_issues.length}`);
    
    // Show patients by total risk score for analysis
    console.log("\n=== RISK SCORE DISTRIBUTION ===");
    const riskDistribution = {};
    patientsWithRisk.forEach(patient => {
        const score = patient.totalRiskScore;
        if (!riskDistribution[score]) riskDistribution[score] = 0;
        riskDistribution[score]++;
    });
    Object.keys(riskDistribution).sort((a, b) => parseInt(a) - parseInt(b)).forEach(score => {
        console.log(`Score ${score}: ${riskDistribution[score]} patients`);
    });
    
    console.log("\n=== READY TO SUBMIT? (y/n) ===");
    console.log("Review the analysis above. If everything looks correct, manually submit the assessment.");
    
    // Comment out auto-submission for manual review
    /*
    // Prepare results for submission
    const results = {
        high_risk_patients: high_risk_patients,
        fever_patients: fever_patients,
        data_quality_issues: data_quality_issues
    };
    
    // Submit assessment
    submitAssessment(results).then(response => {
        console.log("\n=== ASSESSMENT SUBMISSION RESULT ===");
        console.log("Success:", response.success);
        console.log("Score:", response.results.score);
        console.log("Status:", response.results.status);
        if (response.results.feedback) {
            console.log("Feedback:", response.results.feedback);
        }
    }).catch(error => {
        console.error("Error submitting assessment:", error.message);
    });
    */
}).catch(error => {
    console.error("Error fetching patients:", error.message);
});

// submit assessment
function submitAssessment(assessmentData) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${api_base_url}${api_submit_assessment_path}`);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            method: 'POST',
            path: url.pathname,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': api_header_key
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`Failed to submit assessment: ${data}`));
                    }
                } catch (error) {
                    reject(new Error(`JSON parse error: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request error: ${error.message}`));
        });

        req.write(JSON.stringify(assessmentData));
        req.end();
    });
}
