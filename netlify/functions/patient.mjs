import { getJSON, setJSON, json } from './_store.mjs';
import { requireUser, authError, makeId } from './_auth.mjs';

const emptyRecord = () => ({
  info: {
    name: '', dob: '', age: '', gender: '', bloodGroup: '', height: '', weight: '', phone: '', address: '',
    emergencyName: '', emergencyPhone: '', emergencyRelation: ''
  },
  generalHealth: {
    medicalHistory: '', allergies: '', currentDiseases: '', previousDiseases: '', currentMedicines: '',
    vaccinationHistory: '', surgeryHistory: ''
  },
  maleHealth: { urinaryHistory: '', kidneyUrinaryProblems: '', reproductiveHistory: '', hormonalHistory: '', doctorReports: '' },
  femaleHealth: { menstrualHistory: '', pregnancyHistory: '', pregnancyRecords: '', reproductiveHistory: '', hormonalHistory: '', doctorReports: '' },
  medicalRecords: { doctorVisitHistory: '', prescriptions: '', previousPrescriptions: '', medicalReports: '', labReports: '' },
  prescriptions: [],
  healthModules: {
    medHistory:'', medDoseSchedule:'', medNotes:'',
    bpSystolic:'', bpDiastolic:'', bpPulse:'', bpDate:'', bpNotes:'',
    glucoseFasting:'', glucoseRandom:'', glucoseHba1c:'', glucoseDate:'', glucoseMeds:'', glucoseNotes:'',
    eyeLeft:'', eyeRight:'', eyePressure:'', eyeDate:'', eyeFindings:'', eyeTreatment:'',
    dentalDentist:'', dentalDate:'', dentalLastVisit:'', dentalProblems:'', dentalTreatment:'',
    donationBlood:'', donationLastDate:'', donationCenter:'', donationStatus:'', donationNotes:'',
    apptDate:'', apptTime:'', apptDoctor:'', apptSpecialty:'', apptPurpose:'', apptNotes:'', apptHistory:'',
    periodLastDate:'', periodCycle:'', periodLength:'', periodNextDate:'', periodSymptoms:'', periodNotes:'',
    pregStatus:'', pregLmp:'', pregEdd:'', pregWeeks:'', pregHistory:'', pregReports:'', pregCalendar:'', pregNotes:''
  },
  medicalPhotos: [],
  updatedAt: null,
});

function clean(v, max = 8000) { return String(v ?? '').slice(0, max); }

export default async (req) => {
  const user = await requireUser(req);
  if (!user) return authError();
  const key = `patient:${user.accountId}`;
  try {
    if (req.method === 'GET') {
      let record = await getJSON(key, emptyRecord());
      // Backward-compatible migration for records created by the previous version.
      if (!record.generalHealth && (record.history !== undefined || record.diseases !== undefined)) {
        record = {
          ...emptyRecord(), ...record,
          info: { ...emptyRecord().info, ...(record.info || {}) },
          generalHealth: { ...emptyRecord().generalHealth, medicalHistory: record.history || '', allergies: record.allergies || record.info?.allergies || '', currentDiseases: '', previousDiseases: record.diseases || '', currentMedicines: record.medicines || '' },
          medicalRecords: { ...emptyRecord().medicalRecords, medicalReports: record.reports || '' },
        };
      }
      return json({ success: true, record });
    }
    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
    const body = await req.json();
    const record = await getJSON(key, emptyRecord());

    if (body.action === 'update_info') {
      const p = body.patientData || {};
      const old = record.info || {};
      record.info = {
        name: clean(p.name, 150), dob: clean(p.dob, 20), age: clean(p.age, 10), gender: clean(p.gender, 10), bloodGroup: clean(p.bloodGroup, 30),
        height: clean(p.height, 30), weight: clean(p.weight, 30), phone: clean(p.phone, 40), address: clean(p.address, 1000),
        emergencyName: clean(p.emergencyName, 150), emergencyPhone: clean(p.emergencyPhone, 40), emergencyRelation: clean(p.emergencyRelation, 80),
      };
      record.generalHealth = {
        medicalHistory: clean(p.medicalHistory, 8000), allergies: clean(p.allergies, 3000), currentDiseases: clean(p.currentDiseases, 5000),
        previousDiseases: clean(p.previousDiseases, 5000), currentMedicines: clean(p.currentMedicines, 5000),
        vaccinationHistory: clean(p.vaccinationHistory, 5000), surgeryHistory: clean(p.surgeryHistory, 5000),
      };
      record.maleHealth = {
        urinaryHistory: clean(p.urinaryHistory, 4000), kidneyUrinaryProblems: clean(p.kidneyUrinaryProblems, 4000),
        reproductiveHistory: clean(p.reproductiveHistory, 4000), hormonalHistory: clean(p.maleHormonalHistory, 4000), doctorReports: clean(p.maleDoctorReports, 5000),
      };
      record.femaleHealth = {
        menstrualHistory: clean(p.menstrualHistory, 4000), pregnancyHistory: clean(p.pregnancyHistory, 4000),
        pregnancyRecords: clean(p.pregnancyRecords, 5000), reproductiveHistory: clean(p.femaleReproductiveHistory, 4000),
        hormonalHistory: clean(p.femaleHormonalHistory, 4000), doctorReports: clean(p.femaleDoctorReports, 5000),
      };
      // Keep the older detailed male/female/medical-record fields when a newer UI does not edit them.
      const oldMale = record.maleHealth || emptyRecord().maleHealth;
      const oldFemale = record.femaleHealth || emptyRecord().femaleHealth;
      const oldRecords = record.medicalRecords || emptyRecord().medicalRecords;
      record.maleHealth = { ...oldMale,
        urinaryHistory: p.urinaryHistory !== undefined ? clean(p.urinaryHistory, 4000) : oldMale.urinaryHistory,
        kidneyUrinaryProblems: p.kidneyUrinaryProblems !== undefined ? clean(p.kidneyUrinaryProblems, 4000) : oldMale.kidneyUrinaryProblems,
        reproductiveHistory: p.reproductiveHistory !== undefined ? clean(p.reproductiveHistory, 4000) : oldMale.reproductiveHistory,
        hormonalHistory: p.maleHormonalHistory !== undefined ? clean(p.maleHormonalHistory, 4000) : oldMale.hormonalHistory,
        doctorReports: p.maleDoctorReports !== undefined ? clean(p.maleDoctorReports, 5000) : oldMale.doctorReports,
      };
      record.femaleHealth = { ...oldFemale,
        menstrualHistory: p.menstrualHistory !== undefined ? clean(p.menstrualHistory, 4000) : oldFemale.menstrualHistory,
        pregnancyHistory: p.pregnancyHistory !== undefined ? clean(p.pregnancyHistory, 4000) : oldFemale.pregnancyHistory,
        pregnancyRecords: p.pregnancyRecords !== undefined ? clean(p.pregnancyRecords, 5000) : oldFemale.pregnancyRecords,
        reproductiveHistory: p.femaleReproductiveHistory !== undefined ? clean(p.femaleReproductiveHistory, 4000) : oldFemale.reproductiveHistory,
        hormonalHistory: p.femaleHormonalHistory !== undefined ? clean(p.femaleHormonalHistory, 4000) : oldFemale.hormonalHistory,
        doctorReports: p.femaleDoctorReports !== undefined ? clean(p.femaleDoctorReports, 5000) : oldFemale.doctorReports,
      };
      record.medicalRecords = { ...oldRecords,
        doctorVisitHistory: p.doctorVisitHistory !== undefined ? clean(p.doctorVisitHistory, 8000) : oldRecords.doctorVisitHistory,
        prescriptions: p.prescriptions !== undefined ? clean(p.prescriptions, 8000) : oldRecords.prescriptions,
        previousPrescriptions: p.previousPrescriptions !== undefined ? clean(p.previousPrescriptions, 8000) : oldRecords.previousPrescriptions,
        medicalReports: p.medicalReports !== undefined ? clean(p.medicalReports, 8000) : oldRecords.medicalReports,
        labReports: p.labReports !== undefined ? clean(p.labReports, 8000) : oldRecords.labReports,
      };
      const moduleKeys = ['medHistory','medDoseSchedule','medNotes','bpSystolic','bpDiastolic','bpPulse','bpDate','bpNotes','glucoseFasting','glucoseRandom','glucoseHba1c','glucoseDate','glucoseMeds','glucoseNotes','eyeLeft','eyeRight','eyePressure','eyeDate','eyeFindings','eyeTreatment','dentalDentist','dentalDate','dentalLastVisit','dentalProblems','dentalTreatment','donationBlood','donationLastDate','donationCenter','donationStatus','donationNotes','apptDate','apptTime','apptDoctor','apptSpecialty','apptPurpose','apptNotes','apptHistory','periodLastDate','periodCycle','periodLength','periodNextDate','periodSymptoms','periodNotes','pregStatus','pregLmp','pregEdd','pregWeeks','pregHistory','pregReports','pregCalendar','pregNotes'];
      record.healthModules = { ...(record.healthModules || {}) };
      for (const k of moduleKeys) if (p[k] !== undefined) record.healthModules[k] = clean(p[k], 8000);
      record.medicalPhotos = Array.isArray(record.medicalPhotos) ? record.medicalPhotos : [];
      record.updatedAt = new Date().toISOString();
      await setJSON(key, record);
      return json({ success: true, message: 'Patient information saved.', record });
    }

    if (body.action === 'add_prescription') {
      const photo = String(body.photoData || '');
      if (!photo.startsWith('data:image/')) return json({ error: 'শুধু image upload করা যাবে।' }, 400);
      if (photo.length > 4_000_000) return json({ error: 'ছবিটি ছোট করুন (প্রায় 3MB-এর মধ্যে)।' }, 413);
      const rx = {
        id: makeId('RX'), doctorName: clean(body.doctorName, 200), date: clean(body.date, 20), note: clean(body.note, 1000),
        photoData: photo, createdAt: new Date().toISOString(),
      };
      if (!rx.doctorName || !rx.date) return json({ error: 'Doctor name ও date দিন।' }, 400);
      record.prescriptions = [rx, ...(record.prescriptions || [])].slice(0, 40);
      record.updatedAt = new Date().toISOString();
      await setJSON(key, record);
      return json({ success: true, message: 'পুরোনো prescription সংরক্ষণ করা হয়েছে।', prescription: { ...rx, photoData: undefined } });
    }


    if (body.action === 'add_medical_photo') {
      const photo = String(body.photoData || '');
      if (!photo.startsWith('data:image/')) return json({ error: 'শুধু image upload করা যাবে।' }, 400);
      if (photo.length > 4_000_000) return json({ error: 'ছবিটি ছোট করুন (প্রায় 3MB-এর মধ্যে)।' }, 413);
      const item = { id: makeId('MP'), title: clean(body.title, 200) || 'Medical Photo', date: clean(body.date, 20), photoData: photo, createdAt: new Date().toISOString() };
      record.medicalPhotos = [item, ...(record.medicalPhotos || [])].slice(0, 30);
      record.updatedAt = new Date().toISOString();
      await setJSON(key, record);
      return json({ success: true, message: 'Medical photo সংরক্ষণ করা হয়েছে।' });
    }

    if (body.action === 'delete_prescription') {
      record.prescriptions = (record.prescriptions || []).filter(x => x.id !== body.id);
      record.updatedAt = new Date().toISOString();
      await setJSON(key, record);
      return json({ success: true, message: 'Prescription মুছে ফেলা হয়েছে।' });
    }
    return json({ error: 'Invalid action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Patient record save failed.' }, 500);
  }
};
