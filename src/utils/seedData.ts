import type { NurseDatabase, StudentRecord } from './nurseLogic';

export const SCHOOL_NAME = 'Saraswati Vidya Academy';
export const SCHOOL_LOGO_URL = '/sva-logo.png';
export const SCHOOL_LOGO_FALLBACK_URL = 'https://saraswatividya.academy/img/logo/SVA_Logo_Color.png';
export const SCHOOL_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_STAFF_NAME = 'Infirmary In-Charge';
export const DEFAULT_NURSE_NAME = DEFAULT_STAFF_NAME; // Backward compatibility alias
export const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxpB8pHEpmaZwnp6Zgzksl5xpFRi55EdE_srVOC7STWHcwiWp-lN-t4R1Zt207diPaLqQ/exec';


export function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNowLocalDatetimeString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export const SCHOOL_CLASSES = [
  'Sparkle',
  'Twinkle',
  'Topaz',
  'Jade',
  'Garnet',
  'Emerald',
  'Ruby',
  'Diamond',
];

const SPARKLE_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Ajinkya Balu Gurav' },
  { roll: '02', name: 'Ankita Rangnath Ghige' },
  { roll: '03', name: 'Anushka Balasaheb Jalhare' },
  { roll: '04', name: 'Bhakti Dnyaneshwar Aghav' },
  { roll: '05', name: 'Dhananjay Gajanan Ghuge' },
  { roll: '06', name: 'Divya Raju Rathod' },
  { roll: '07', name: 'Dnyaneshwari Kailas Bhivarkar' },
  { roll: '08', name: 'Gaikawad Prem Narayan' },
  { roll: '09', name: 'Gulshan Vilas Atram' },
  { roll: '10', name: 'Haresh Tarsing Vasave' },
  { roll: '11', name: 'Harshal Shubhash Linge' },
  { roll: '12', name: 'Ishwari Rajaram Ubale' },
  { roll: '13', name: 'Komal Babasaheb Suryvanshi' },
  { roll: '14', name: 'Krish Yogendra Thakare' },
  { roll: '15', name: 'Krushna Amol Dhole' },
  { roll: '16', name: 'Krushna Sarjerao Gaikwad' },
  { roll: '17', name: 'Manyata Navnath More' },
  { roll: '18', name: 'Mukta Navanath Sarang' },
  { roll: '19', name: 'Narayan Pradip Kashid' },
  { roll: '20', name: 'Om Suresh Sadar' },
  { roll: '21', name: 'Parth Amol Faltankar' },
  { roll: '22', name: 'Pooja Purushottam Indore' },
  { roll: '23', name: 'Pragati Chandrakumar Late' },
  { roll: '24', name: 'Pragati Ramprabhu Jadhav' },
  { roll: '25', name: 'Prathmesh Sagar Yawale' },
  { roll: '26', name: 'Rishabh Ranjit Sabale' },
  { roll: '27', name: 'Rudra Uddhav Sanap' },
  { roll: '28', name: 'Sakshi Sandip Nagargoje' },
  { roll: '29', name: 'Shreyas Santosh Bankar' },
  { roll: '30', name: 'Swaraj Ajit Patil' },
];

const TWINKLE_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Aayush Satish Nalawade' },
  { roll: '02', name: 'Anita Gopal Tengse' },
  { roll: '03', name: 'Ankita Bharat Mulik' },
  { roll: '04', name: 'Antara Manoj Karete' },
  { roll: '05', name: 'Anushka Rajaram Gangurde' },
  { roll: '06', name: 'Bhagyashree Nandkishor Raut' },
  { roll: '07', name: 'Bhakti Gajanan Ingale' },
  { roll: '08', name: 'Eshwari Uttam Desai' },
  { roll: '09', name: 'Harshada Haridas Bahir' },
  { roll: '10', name: 'Manswi Gautam Jamdhade' },
  { roll: '11', name: 'Prabuddha Pritam Nawghare' },
  { roll: '12', name: 'Prachi Gautam Dudhawade' },
  { roll: '13', name: 'Pragati Udhav Hinge' },
  { roll: '14', name: 'Prajakta Ram Thorat' },
  { roll: '15', name: 'Pruthviraj Gajanan Manavatkar' },
  { roll: '16', name: 'Raj Shahaji Mali' },
  { roll: '17', name: 'Sagar Laxman Umap' },
  { roll: '18', name: 'Sahan Mersing Pawara' },
  { roll: '19', name: 'Sai Sukhadev Manjare' },
  { roll: '20', name: 'Sainath Dnyanoba Kale' },
  { roll: '21', name: 'Sanket Yogesh Bhadane' },
  { roll: '22', name: 'Sanskar Vikram Gurnule' },
  { roll: '23', name: 'Sarthak Hanumant Chavan' },
  { roll: '24', name: 'Shraddha Narayan Wandhare' },
  { roll: '25', name: 'Shrijit Vilas Chaukhande' },
  { roll: '26', name: 'Swarali Machhindra Bhashte' },
  { roll: '27', name: 'Tanmay Ram Sangule' },
  { roll: '28', name: 'Tanmay Shivaji Tahakik' },
  { roll: '29', name: 'Ved Bhikaji Jondhale' },
];

const TOPAZ_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Anand Vishnu Tatar' },
  { roll: '02', name: 'Anaya Vinit Meshram' },
  { roll: '03', name: 'Ankita Sandip Borkar' },
  { roll: '04', name: 'Aryan Ramchandra Kamble' },
  { roll: '05', name: 'Bajrang Ambadas Parsakar' },
  { roll: '06', name: 'Chaitanya Govind Korde' },
  { roll: '07', name: 'Dnyaneshwari Bibhishan Kokate' },
  { roll: '08', name: 'Ganesh Ashok Shinde' },
  { roll: '09', name: 'Ganesh Vijay Saidane' },
  { roll: '10', name: 'Gauri Devidas Chavan' },
  { roll: '11', name: 'Ishwari Eknath Jamge' },
  { roll: '12', name: 'Kanishka Vilas Bansode' },
  { roll: '13', name: 'Kartik Ashok Shinde' },
  { roll: '14', name: 'Lavanya Laxman More' },
  { roll: '15', name: 'Mangesh Godhaji Narwade' },
  { roll: '16', name: 'Mayur Dipak Patil' },
  { roll: '17', name: 'Mokshada Rama Bhalerao' },
  { roll: '18', name: 'Nisha Yogesh Chavhan' },
  { roll: '19', name: 'Pallavi Sahebarao Shinde' },
  { roll: '20', name: 'Pranav Uttreshwar Ubale' },
  { roll: '21', name: 'Rahul Ramchandra Salunke' },
  { roll: '22', name: 'Roshani Punamchand Prajapati' },
  { roll: '23', name: 'Sai Ramkishan Chavhan' },
  { roll: '24', name: 'Samarth Bhagwat Kakde' },
  { roll: '25', name: 'Sandhya Santosh Kute' },
  { roll: '26', name: 'Sangharsh Diliparao Salve' },
  { roll: '27', name: 'Sarthak Sandip Mormare' },
  { roll: '28', name: 'Shivraj Ramchandra Dhumal' },
  { roll: '29', name: 'Shivtej Eknath Chavan' },
  { roll: '30', name: 'Shreya Yogeshkumar Kandekar' },
  { roll: '31', name: 'Shruti Naresh Patil' },
  { roll: '32', name: 'Snehal Satish Yevle' },
  { roll: '33', name: 'Soham Kishanrao Bhusse' },
  { roll: '34', name: 'Swara Pravin Jadhav' },
  { roll: '35', name: 'Swarup Prakash Mohite' },
  { roll: '36', name: 'Vaishnav Krushna Jadhav' },
  { roll: '37', name: 'Vaishnavi Balu Gatkal' },
  { roll: '38', name: 'Vaishnavi Bhaurao Savandakar' },
  { roll: '39', name: 'Yash Ashok Giram' },
  { roll: '40', name: 'Yashashri Yuvraj Bhavar' },
];

const JADE_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Aaradhya Vijay Borkar' },
  { roll: '02', name: 'Abhilasha Shivaji Ghuge' },
  { roll: '03', name: 'Akshara Anil Nisargandh' },
  { roll: '04', name: 'Anisha Arun Kedar' },
  { roll: '05', name: 'Ansh Gulab Janbandhu' },
  { roll: '06', name: 'Anushka Shivaji Patil' },
  { roll: '07', name: 'Ashish Gorakhnath Bhumare' },
  { roll: '08', name: 'Dinesh Maruti Sonwane' },
  { roll: '09', name: 'Divya Govind Alane' },
  { roll: '10', name: 'Dnyaneshwari Navnath Chavhan' },
  { roll: '11', name: 'Ganesh Chandu Suryavanshi' },
  { roll: '12', name: 'Gururaj Avinash Dabhade' },
  { roll: '13', name: 'Janhavi Suresh Jadhav' },
  { roll: '14', name: 'Jignesh Haridas More' },
  { roll: '15', name: 'Kartik Mahendra Chavhan' },
  { roll: '16', name: 'Kaveri Sheshrao Satare' },
  { roll: '17', name: 'Mayur Manoj Ambhore' },
  { roll: '18', name: 'Piyush Gautam Jamdhade' },
  { roll: '19', name: 'Prachi Prakash Nawghre' },
  { roll: '20', name: 'Pranali Anil Gaikwad' },
  { roll: '21', name: 'Pranjal Prasadarao Garud' },
  { roll: '22', name: 'Pravin Devanand Banjara' },
  { roll: '23', name: 'Rajratan Rahul Thorat' },
  { roll: '24', name: 'Rudra Milind Khade' },
  { roll: '25', name: 'Samiksha Sandip Takankhar' },
  { roll: '26', name: 'Sandip Sanjay Hiras' },
  { roll: '27', name: 'Sanvidhan Dilip Ingole' },
  { roll: '28', name: 'Sarthak Sachin Sanap' },
  { roll: '29', name: 'Saurav Kiran Narwade' },
  { roll: '30', name: 'Sayli Dnyanoba Chaudhari' },
  { roll: '31', name: 'Shraddha Sandip Ghuge' },
  { roll: '32', name: 'Sneha Baban Ghuge' },
  { roll: '33', name: 'Soham Ravi Ghangale' },
  { roll: '34', name: 'Someshwar Parmeshwar Babare' },
  { roll: '35', name: 'Sushant Santosh Amborkar' },
  { roll: '36', name: 'Vaibhav Nana Kokani' },
  { roll: '37', name: 'Vaishnavi Sunil Padvi' },
  { roll: '38', name: 'Vira Ramdas Pawara' },
  { roll: '39', name: 'Yashkumar Kiran Pavara' },
  { roll: '40', name: 'Yogeshwari Kamalaji Bhumare' },
];

const GARNET_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Akshara Ashok Rasve' },
  { roll: '02', name: 'Anurag Baban Kanade' },
  { roll: '03', name: 'Anushka Govind Sawant' },
  { roll: '04', name: 'Ayush Sopan Dalave' },
  { roll: '05', name: 'Devesh Nilesh Thakur' },
  { roll: '06', name: 'Dhananjay Bapurao Sawant' },
  { roll: '07', name: 'Gauri Chandrakant Tekule' },
  { roll: '08', name: 'Ishwari Somanath Lakade' },
  { roll: '09', name: 'Ishwari Pralhad Khirasagar' },
  { roll: '10', name: 'Jay Rohidas Jadhav' },
  { roll: '11', name: 'Jayashree Jagannath Aher' },
  { roll: '12', name: 'Jihan Shakil Shaikh' },
  { roll: '13', name: 'Kavita Shantaram Kumbhar' },
  { roll: '14', name: 'Ketaki Laxman Potawade' },
  { roll: '15', name: 'Kirti Balu Yevale' },
  { roll: '16', name: 'Krish Roshan Karete' },
  { roll: '17', name: 'Krishna Digambar Gajmal' },
  { roll: '18', name: 'Krushna Rakesh Zanjad' },
  { roll: '19', name: 'Mangesh Gajanan Rathod' },
  { roll: '20', name: 'Payal Gopal Bharti' },
  { roll: '21', name: 'Pooja Janardhan Barve' },
  { roll: '22', name: 'Pranali Sandip Kute' },
  { roll: '23', name: 'Prathamesh Anil Phadatare' },
  { roll: '24', name: 'Pratiksha Navnath Nevhal' },
  { roll: '25', name: 'Radhika Satwaji Shinde' },
  { roll: '26', name: 'Sampada Shankar Thodasare' },
  { roll: '27', name: 'Sarthak Ganesh Dolas' },
  { roll: '28', name: 'Satyam Suresh Wankhede' },
  { roll: '29', name: 'Shradha Devarao Sawandkar' },
  { roll: '30', name: 'Shrawani Santosh Waghmare' },
  { roll: '31', name: 'Siddharth Ramdas Golim' },
  { roll: '32', name: 'Sofiya Begam Shakil Shaikh' },
  { roll: '33', name: 'Viraj Balaji Mali' },
  { roll: '34', name: 'Yash Dnyaneshwar Darade' },
  { roll: '35', name: 'Yash Divakar Zanjal' },
];

const EMERALD_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Aarohi Ashok Gajmal' },
  { roll: '02', name: 'Aarti Munjaji Thorat' },
  { roll: '03', name: 'Aradhya Manoharsha Boga' },
  { roll: '04', name: 'Atish Kishan Dhore' },
  { roll: '05', name: 'Bhakti Bandu Sangale' },
  { roll: '06', name: 'Bhushan Aatmaram Bhil' },
  { roll: '07', name: 'Dipti Manesh Raut' },
  { roll: '08', name: 'Gayatri Manik Ingle' },
  { roll: '09', name: 'Janhavi Parasram Pawar' },
  { roll: '10', name: 'Jivak Chandu Chakre' },
  { roll: '11', name: 'Mahi Rakesh Meshram' },
  { roll: '12', name: 'Mayuresh Arjun Bhogaonkar' },
  { roll: '13', name: 'Nakusha Sanjay Surye' },
  { roll: '14', name: 'Pratiksha Keshav Balkhande' },
  { roll: '15', name: 'Pratiksha Sanjay Thoke' },
  { roll: '16', name: 'Rameshwar Apparao Bhumare' },
  { roll: '17', name: 'Sai Munjaji Mahale' },
  { roll: '18', name: 'Sairaj Kishan Dake' },
  { roll: '19', name: 'Sambhaji Namdev Chavan' },
  { roll: '20', name: 'Sangharsh Sunil Survase' },
  { roll: '21', name: 'Shahaji Narayan Navghare' },
  { roll: '22', name: 'Shital Kaloji Panchal' },
  { roll: '23', name: 'Shivani Sampat Shinde' },
  { roll: '24', name: 'Shravani Gangadhar Survase' },
  { roll: '25', name: 'Shubham Sandip Mane' },
  { roll: '26', name: 'Siddhanth Jagdish Raychure' },
  { roll: '27', name: 'Sidharaj Balaji Karhale' },
  { roll: '28', name: 'Sneha Dnyanoba Dalave' },
  { roll: '29', name: 'Srushti Subhash Kharate' },
  { roll: '30', name: 'Tanvi Munjaji Kadam' },
  { roll: '31', name: 'Utkarsha Madhav Kure' },
  { roll: '32', name: 'Vaishnav Ganesh Dhore' },
  { roll: '33', name: 'Vasant Trymbak Jadhav' },
  { roll: '34', name: 'Yashwant Bhagwan Jadhav' },
];

const RUBY_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Akshara Shadanan Masure' },
  { roll: '02', name: 'Amarnath Arvind Pacharne' },
  { roll: '03', name: 'Aradhya Vishnu Chavan' },
  { roll: '04', name: 'Atharv Sandip Awghade' },
  { roll: '05', name: 'Dinesh Anil Chaudhari' },
  { roll: '06', name: 'Dipashree Purushottam Moranakar' },
  { roll: '07', name: 'Ganesh Laxman Chavan' },
  { roll: '08', name: 'Gaurav Shahaji Malave' },
  { roll: '09', name: 'Gurudeo Vijay Godbole' },
  { roll: '10', name: 'Harshada Laxman Mirase' },
  { roll: '11', name: 'Janhavi Maruti Varake' },
  { roll: '12', name: 'Jiya Bashir Shanediwan' },
  { roll: '13', name: 'Khushi Pralhad Chavan' },
  { roll: '14', name: 'Madhavi Prakash Patil' },
  { roll: '15', name: 'Naitik Pandurang Kamble' },
  { roll: '16', name: 'Omkar Shankarrao Chavan' },
  { roll: '17', name: 'Patil Nilgriv Manohar' },
  { roll: '18', name: 'Payal Ramesh Shillar' },
  { roll: '19', name: 'Prathmesh Pradip Chavan' },
  { roll: '20', name: 'Priyanka Babasaheb Ture' },
  { roll: '21', name: 'Rudranil Sachin Raut' },
  { roll: '22', name: 'Samarth Bhikaji Gurav' },
  { roll: '23', name: 'Samiksha Prashant Jawale' },
  { roll: '24', name: 'Samrudhi Aatamaram Lohat' },
  { roll: '25', name: 'Sanskruti Mayur Hagwane' },
  { roll: '26', name: 'Sarthak Rajaram Ranmale' },
  { roll: '27', name: 'Sharvari Mukunda Meshram' },
  { roll: '28', name: 'Shivraj Vishnu Ingale' },
  { roll: '29', name: 'Shreya Santosh Chavan' },
  { roll: '30', name: 'Snehal Jagdish Desale' },
  { roll: '31', name: 'Soham Dnyaneshwar Ippar' },
  { roll: '32', name: 'Soham Pradip Khandare' },
  { roll: '33', name: 'Swapnali Dilip Gavad' },
  { roll: '34', name: 'Vedant Sopan Vaidya' },
  { roll: '35', name: 'Vighnesh Vijay Shinde' },
  { roll: '36', name: 'Yash Narendra Fadale' },
  { roll: '37', name: 'Yuvaraj Jagdish Chavan' },
];

const DIAMOND_ROSTER: Array<{ roll: string; name: string }> = [
  { roll: '01', name: 'Anjali Sandip Chavan' },
  { roll: '02', name: 'Anushka Sachin Patil' },
  { roll: '03', name: 'Arnav Navnath Waghole' },
  { roll: '04', name: 'Astha Ajay Jhariya' },
  { roll: '05', name: 'Atharv Rajendra Barad' },
  { roll: '06', name: 'Atharv Suresh Chavan' },
  { roll: '07', name: 'Bhairavi Avinash Kurve' },
  { roll: '08', name: 'Bhakti Gopichand Chavan' },
  { roll: '09', name: 'Gaurav Arunrao Ghumare' },
  { roll: '10', name: 'Harshada Pandurang Kadam' },
  { roll: '11', name: 'Jivan Jitendra Chavan' },
  { roll: '12', name: 'Karan Jagannath Ghuge' },
  { roll: '13', name: 'Lavanya Ganesh Jadhav' },
  { roll: '14', name: 'Nandini Vishvaambar Raut' },
  { roll: '15', name: 'Om Sambhaji Patil' },
  { roll: '16', name: 'Prachi Mansing Pawara' },
  { roll: '17', name: 'Pranita Radhakishan Gore' },
  { roll: '18', name: 'Prathmesh Gajanan Jadhav' },
  { roll: '19', name: 'Rajveer Nitin Tiruke' },
  { roll: '20', name: 'Sahil Popat Vasane' },
  { roll: '21', name: 'Samarth Satish Bhalerao' },
  { roll: '22', name: 'Samruddhi Shyamrao Gajmal' },
  { roll: '23', name: 'Sanika Gajanan Dalave' },
  { roll: '24', name: 'Sanket Santosh Chavan' },
  { roll: '25', name: 'Satish Mahadev Patil' },
  { roll: '26', name: 'Shivam Bhaurao Holkar' },
  { roll: '27', name: 'Shravan Nanasaheb Jadhav' },
  { roll: '28', name: 'Sneha Sandip Patil' },
  { roll: '29', name: 'Soham Pandurang More' },
  { roll: '30', name: 'Srushti Shivaji Dudhate' },
  { roll: '31', name: 'Tanuja Ashok Arkile' },
  { roll: '32', name: 'Varnav Ajay Patil' },
  { roll: '33', name: 'Vedika Keshav Ture' },
  { roll: '34', name: 'Viranjali Varsha Kamble' },
  { roll: '35', name: 'Yashraj Suresh Maskar' },
];

export function createInitialSeedDatabase(): NurseDatabase {
  const today = getTodayLocalDateString();
  const students: StudentRecord[] = [];
  let globalSeq = 1;

  const addRoster = (sectionName: string, roster: Array<{ roll: string; name: string }>) => {
    for (const entry of roster) {
      const seq = String(globalSeq).padStart(4, '0');
      students.push({
        student_id: `STU-2026-${seq}`,
        full_name: entry.name,
        section: sectionName,
        roll_number: entry.roll,
        active_status: 'Active',
        created_at: '2026-06-15T08:30:00.000Z',
        updated_at: '2026-10-01T09:00:00.000Z',
      });
      globalSeq++;
    }
  };

  addRoster('Sparkle', SPARKLE_ROSTER);
  addRoster('Twinkle', TWINKLE_ROSTER);
  addRoster('Topaz', TOPAZ_ROSTER);
  addRoster('Jade', JADE_ROSTER);
  addRoster('Garnet', GARNET_ROSTER);
  addRoster('Emerald', EMERALD_ROSTER);
  addRoster('Ruby', RUBY_ROSTER);
  addRoster('Diamond', DIAMOND_ROSTER);

  return {
    students,
    visits: [],
    measurements: [],
    healthProfiles: [],
  };
}

