const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const {sections, scenarios} = HANDBOOK_DATA;

const UI = {
  en: {
    helperName: 'English helper layer',
    disclaimerLead: 'Official text controls.',
    disclaimer: 'Helper answers make the handbook easier to understand, but they are not the official rule. If a helper answer, summary, or Spanish translation ever seems different from the handbook, follow the official handbook/PDF or ask the school office.',
    convenience: '',
    allSections: 'All Sections',
    popularTopics: 'Popular scenario topics',
    startHere: 'Common Student Questions',
    scenarioHelpers: 'Scenario helpers',
    needHelp: 'I need help with…',
    showAll: 'Show All Sections',
    tabs: {official:'Official Text', pdf:'Original Page View', plain:'What This Means', student:'Student Quick View', parent:'Parent/Guardian View'},
    cardOfficial: 'Official Handbook Text',
    cardOriginal: 'Original PDF Page View',
    pdfOpenLabel: 'Open this page in the original PDF',
    pdfHint: 'This view shows the formatted handbook page from the original PDF. Use Official Text for searchable text, and Original Page View when layout, tables, or formatting matter.',
    cardHelper: 'Helper Explanation',
    keyDetails: 'Key Details',
    related: 'Related Sections',
    finalWord: 'Need the final word?',
    finalWordText: 'Open the original PDF or contact the school office for clarification, especially for questions involving credits, discipline, eligibility, attendance, or legal rights.',
    openPdf: 'Open Original PDF',
    helperReminderPlain: 'This is a helper explanation only. If anything seems different, follow the official handbook/PDF or ask the school office.',
    helperReminderStudent: 'This is only a student-friendly guide. The official handbook text controls.',
    helperReminderParent: 'This is only a parent/guardian-friendly guide. The official handbook text controls.',
    sourceLabel: 'Official source',
    pdfPage: 'PDF page',
    pdfPages: 'PDF pages',
    originalControls: 'Original PDF controls formatting',
    noMatches: 'No matches yet.',
    trySearch: 'Try another keyword from the handbook.',
    searchHelperNote: 'Search includes official text and helper layers.',
    langNote: 'Helper layer: English',
    howToTitle: 'How to use this site',
    howToText: 'Search a question, click a scenario card, or browse by handbook section. Helper answers explain the handbook, but the official text/PDF is the rule.',
    officeBadge: 'Office clarification needed',
    officeBadgeShort: 'Ask the office',
    pdfTip: 'Want to see the exact formatted handbook page? Use Original Page View.'
  },
  es: {
    helperName: 'Capa de ayuda en español',
    disclaimerLead: 'El texto oficial controla.',
    disclaimer: 'El texto oficial del manual es la política que controla. Las explicaciones en lenguaje sencillo, traducciones al español, resúmenes, ejemplos y herramientas de ayuda se proporcionan solo para ayudar a estudiantes y familias a entender el manual. Si hay algún conflicto, el texto oficial del manual y el PDF original controlan.',
    convenience: 'Traducción de cortesía: el texto oficial en inglés no ha sido reemplazado.',
    allSections: 'Todas las secciones',
    popularTopics: 'Temas de situaciones populares',
    startHere: 'Preguntas comunes de estudiantes',
    scenarioHelpers: 'Ayudas por situación',
    needHelp: 'Necesito ayuda con…',
    showAll: 'Mostrar todas las secciones',
    tabs: {official:'Texto oficial', pdf:'Vista de la página original', plain:'Qué significa', student:'Vista rápida para estudiantes', parent:'Vista para padres/tutores'},
    cardOfficial: 'Texto oficial del manual',
    cardOriginal: 'Vista de la página original del PDF',
    pdfOpenLabel: 'Abrir esta página en el PDF original',
    pdfHint: 'Esta vista muestra la página formateada del manual original. Usa Texto oficial para búsqueda, y Vista de la página original cuando importen el diseño, las tablas o el formato.',
    cardHelper: 'Explicación de ayuda',
    keyDetails: 'Detalles clave',
    related: 'Secciones relacionadas',
    finalWord: '¿Necesita la respuesta final?',
    finalWordText: 'Abra el PDF original o comuníquese con la oficina de la escuela para aclaración, especialmente en preguntas sobre créditos, disciplina, elegibilidad, asistencia o derechos legales.',
    openPdf: 'Abrir PDF original',
    helperReminderPlain: 'Esta es solo una explicación de cortesía. El texto oficial del manual controla.',
    helperReminderStudent: 'Esta es solo una guía para estudiantes. El texto oficial del manual controla.',
    helperReminderParent: 'Esta es solo una guía para padres/tutores. El texto oficial del manual controla.',
    sourceLabel: 'Fuente oficial',
    pdfPage: 'Página PDF',
    pdfPages: 'Páginas PDF',
    originalControls: 'El PDF original controla el formato',
    noMatches: 'Todavía no hay resultados.',
    trySearch: 'Pruebe otra palabra clave del manual.',
    searchHelperNote: 'La búsqueda incluye el texto oficial y las capas de ayuda.',
    langNote: 'Capa de ayuda: Español',
    howToTitle: 'Cómo usar este sitio',
    howToText: 'Busca una pregunta, elige una tarjeta de situación o navega por sección del manual. Las ayudas explican el manual, pero el texto oficial/PDF es la regla.',
    officeBadge: 'Se necesita aclaración de la oficina',
    officeBadgeShort: 'Preguntar en la oficina',
    pdfTip: '¿Quieres ver la página exacta con formato del manual? Usa Vista de la página original.'
  }
};

const categoryLabels = {
  es: {
    'All Sections':'Todas las secciones',
    'Welcome & General Info':'Bienvenida e información general',
    'Academics & Graduation':'Académicos y graduación',
    'Attendance':'Asistencia',
    'Discipline & Conduct':'Disciplina y conducta',
    'Student Services':'Servicios estudiantiles',
    'Student Government':'Gobierno estudiantil',
    'Reference':'Referencia'
  }
};

const titleES = {
  'Mission Statement':'Declaración de misión',
  'Annual Notifications':'Avisos anuales',
  'Administration & Contact Information':'Administración e información de contacto',
  'Graduation Requirements':'Requisitos de graduación',
  'Grades, Report Cards & Honors':'Calificaciones, reportes y honores',
  'Four-Year Planning Guide':'Guía de planificación de cuatro años',
  'Attendance Policy & Saturday School':'Política de asistencia y Saturday School',
  'Tardy/Cuts Procedures':'Procedimientos de tardanzas/cortes',
  'Attendance Requirements':'Requisitos de asistencia',
  'Expanded Learning Program':'Programa de aprendizaje expandido',
  'Nonprivileged List & Dress Code':'Lista Sin Privilegios y código de vestimenta',
  'Cowboy CODE':'Cowboy CODE',
  'Disciplinary Procedures for Specific Offenses':'Procedimientos disciplinarios para ofensas específicas',
  'Student Sexual Harassment & Bus Conduct':'Acoso sexual estudiantil y conducta en autobús',
  'Student Information and Services':'Información y servicios estudiantiles',
  'Closed Campus & Off-Campus Permits':'Campus cerrado y permisos para salir',
  'Student Government':'Gobierno estudiantil',
  'Truancy or Excessive Absences':'Truancy o ausencias excesivas',
  'Calendar':'Calendario',
  'Bell Schedules':'Horarios de campana',
  'Foggy Day Information':'Información de días con neblina',
  'Campus Map':'Mapa del campus'
};

const cats = ['All Sections', ...Array.from(new Set(sections.map(s => s.category)))];
let activeCategory = 'All Sections';
let activeSection = sections.find(s => s.id === 'graduation-requirements') || sections[0];
let activeTab = 'official';
let helperLang = localStorage.getItem('rhsHelperLang') || 'en';

const popularTopics = [
  {
    id:'graduate-answer',
    title:'What do I need to graduate?',
    esTitle:'¿Qué necesito para graduarme?',
    icon:'🎓',
    sectionId:'graduation-requirements',
    category:'Academics & Graduation',
    summary:'250 credits, required courses, and senior proof of a post-high-school plan.',
    esSummary:'250 créditos, cursos requeridos y comprobante de un plan después de la preparatoria.',
    answer:'You need 250 semester credits in grades 9–12, the required subject courses listed in the handbook, and documented evidence as a senior of one of these: college/vocational school application, proof of employment, three job interviews, or military enlistment.',
    esAnswer:'Necesitas 250 créditos semestrales en grados 9–12, los cursos requeridos que aparecen en el manual, y como estudiante de último año debes presentar comprobante de una de estas opciones: solicitud a universidad/escuela vocacional, prueba de empleo, tres entrevistas de trabajo o alistamiento militar.',
    bullets:['Required areas include social science, English, math, science, PE, fine arts/world language/music/drama, and cohort-specific requirements such as Ethnic Studies and Personal Finance.','Credit checkpoints: 60 credits for sophomore status, 120 for junior status, and 180 for senior status.','Use the official text below for exact course language and cohort years.'],
    esBullets:['Las áreas requeridas incluyen ciencias sociales, inglés, matemáticas, ciencias, educación física, bellas artes/idioma/música/drama y requisitos según la generación como Estudios Étnicos y Finanzas Personales.','Puntos de crédito: 60 para sophomore, 120 para junior y 180 para senior.','Usa el texto oficial abajo para ver el lenguaje exacto y los años por generación.']
  },
  {
    id:'missing-credit-answer',
    title:'What if I’m missing credits?',
    esTitle:'¿Qué pasa si me faltan créditos?',
    icon:'🧭',
    sectionId:'expanded-learning',
    category:'Academics & Graduation',
    summary:'Talk to your counselor. Possible options include Summer School, Cyber High in ELP, or retaking a class.',
    esSummary:'Habla con tu consejero. Opciones posibles incluyen escuela de verano, Cyber High en ELP o repetir una clase.',
    answer:'If you are missing credits, do not wait. Meet with your counselor or administrator to make a credit recovery plan. Possible ways to recover credit may include Summer School, Cyber High through the Expanded Learning Program, or retaking the class during the regular school year. The handbook specifically lists Cyber High Credit Recovery Program under Expanded Learning Program.',
    esAnswer:'Si te faltan créditos, no esperes. Reúnete con tu consejero o administrador para hacer un plan de recuperación de créditos. Posibles formas de recuperar créditos pueden incluir escuela de verano, Cyber High por medio del Programa de Aprendizaje Extendido, o repetir la clase durante el año escolar regular. El manual menciona específicamente Cyber High Credit Recovery Program dentro de Expanded Learning Program.',
    bullets:['Ask which credits you are missing and which graduation requirement they affect.','Confirm whether Summer School, Cyber High, or retaking the course is available for your situation.','Do this early—schedule space and graduation deadlines matter.'],
    esBullets:['Pregunta qué créditos te faltan y qué requisito de graduación afectan.','Confirma si escuela de verano, Cyber High o repetir el curso está disponible para tu situación.','Hazlo temprano: el espacio en el horario y las fechas de graduación importan.']
  },
  {
    id:'ag-grade-answer',
    title:'What grade do I need in a-g classes?',
    esTitle:'¿Qué calificación necesito en clases a-g?',
    icon:'✅',
    sectionId:'four-year-planning',
    category:'Academics & Graduation',
    summary:'The handbook says a minimum grade of C is required in all a-g college prep courses.',
    esSummary:'El manual dice que se requiere una calificación mínima de C en todos los cursos a-g de preparación universitaria.',
    answer:'For college-prep “a-g” courses, the handbook says students need a minimum grade of C. The four-year planning guide also lists CSU/UC subject categories and recommendations.',
    esAnswer:'Para cursos “a-g” de preparación universitaria, el manual dice que los estudiantes necesitan una calificación mínima de C. La guía de cuatro años también enumera las categorías y recomendaciones de CSU/UC.',
    bullets:['A grade below C may not satisfy a-g college-prep expectations.','CSU: 11 of the 15 a-g courses must be completed by the end of junior year.','UC: the handbook lists a minimum weighted GPA of 3.0 in a-g classes from 10th and 11th grade.'],
    esBullets:['Una calificación menor de C puede no cumplir con las expectativas a-g de preparación universitaria.','CSU: 11 de los 15 cursos a-g deben completarse antes del final del penúltimo año.','UC: el manual indica un GPA ponderado mínimo de 3.0 en clases a-g de 10.º y 11.º grado.']
  },
  {
    id:'college-classes-answer',
    title:'What classes do I need for a 4-year university?',
    esTitle:'¿Qué clases necesito para una universidad de 4 años?',
    icon:'🏛️',
    sectionId:'four-year-planning',
    category:'Academics & Graduation',
    summary:'Use the a-g subject list: history, English, math, lab science, world language, visual/performing art, and elective.',
    esSummary:'Usa la lista a-g: historia, inglés, matemáticas, ciencia de laboratorio, idioma, arte visual/escénica y electiva.',
    answer:'The handbook’s four-year planning guide lists the CSU/UC “a-g” subject categories: Social Science, English, Math, Lab Science, World Language, Visual & Performing Art, and College Prep Elective. Students planning for a 4-year university should use this as a guide and confirm details with their counselor.',
    esAnswer:'La guía de cuatro años del manual enumera las categorías “a-g” de CSU/UC: ciencias sociales, inglés, matemáticas, ciencia de laboratorio, idioma, arte visual y escénica, y electiva de preparación universitaria. Los estudiantes que planean una universidad de 4 años deben usar esto como guía y confirmar detalles con su consejero.',
    bullets:['Minimum grade of C in all a-g college prep courses.','CSU/UC require 15 a-g courses; the handbook lists years required and recommendations.','Course planning should be checked every year.'],
    esBullets:['Calificación mínima de C en todos los cursos a-g de preparación universitaria.','CSU/UC requieren 15 cursos a-g; el manual enumera años requeridos y recomendaciones.','El plan de cursos debe revisarse cada año.']
  },
  {
    id:'illness-excused-answer',
    title:'Is illness an excused absence?',
    esTitle:'¿La enfermedad es una ausencia justificada?',
    icon:'🤒',
    sectionId:'attendance-policy',
    category:'Attendance',
    summary:'Yes, illness is listed as an acceptable reason, but it still needs parent/guardian verification.',
    esSummary:'Sí, enfermedad aparece como razón aceptable, pero aún necesita verificación de padre/tutor.',
    answer:'Yes. Illness is listed as an acceptable reason to classify an absence as excused, but the parent/guardian still needs to notify or verify the absence according to the handbook procedure.',
    esAnswer:'Sí. Enfermedad aparece como una razón aceptable para clasificar una ausencia como justificada, pero el padre/madre/tutor todavía debe notificar o verificar la ausencia según el procedimiento del manual.',
    bullets:['Parent/guardian should call between 7:30 a.m. and 12:00 noon.','If the school is not notified, the student must bring a parent note and get an admit slip.','A parent must verify the absence within two days.'],
    esBullets:['El padre/tutor debe llamar entre 7:30 a.m. y 12:00 del mediodía.','Si la escuela no recibe aviso, el estudiante debe traer una nota del padre/tutor y obtener una boleta de admisión.','El padre/tutor debe verificar la ausencia dentro de dos días.']
  },
  {
    id:'absent-answer',
    title:'I was absent. What now?',
    esTitle:'Falté. ¿Ahora qué?',
    icon:'📝',
    sectionId:'attendance-policy',
    category:'Attendance',
    summary:'Have a parent/guardian verify the absence quickly, then check whether it affects credit.',
    esSummary:'Pide que un padre/tutor verifique la ausencia pronto y revisa si afecta créditos.',
    answer:'Have your parent/guardian call the school or send a note. The handbook says a parent must verify a student’s absence within two days or it will be classified as unexcused until cleared in the main office.',
    esAnswer:'Tu padre/madre/tutor debe llamar a la escuela o enviar una nota. El manual dice que la ausencia debe verificarse dentro de dos días o se clasificará como injustificada hasta que se aclare en la oficina principal.',
    bullets:['Call between 7:30 a.m. and 12:00 noon with parent/guardian name, student name, reason, estimated return date, and whether assignments are needed.','Even excused absences may count toward the 10-absence course-credit rule; check Attendance Requirements when absences add up.','Special circumstances may require paperwork and principal review.'],
    esBullets:['Llama entre 7:30 a.m. y 12:00 del mediodía con nombre del padre/tutor, nombre del estudiante, razón, fecha estimada de regreso y si necesita tareas.','Incluso ausencias justificadas pueden contar para la regla de 10 ausencias por crédito; revisa Requisitos de Asistencia si se acumulan ausencias.','Circunstancias especiales pueden requerir documentos y revisión del director.']
  },
  {
    id:'absences-count-answer',
    title:'Do excused absences still count toward the 10-absence rule?',
    esTitle:'¿Las ausencias justificadas cuentan para la regla de 10 ausencias?',
    icon:'📌',
    sectionId:'attendance-requirements',
    category:'Attendance',
    summary:'Yes. The handbook says absences count for any reason except school-sponsored trips.',
    esSummary:'Sí. El manual dice que las ausencias cuentan por cualquier razón excepto viajes patrocinados por la escuela.',
    answer:'Yes. This is one of the most important attendance details. The handbook says if a student misses school for any reason, excused or not, that absence counts against the student. It does not include school-sponsored trips.',
    esAnswer:'Sí. Este es uno de los detalles más importantes de asistencia. El manual dice que si un estudiante falta por cualquier razón, justificada o no, esa ausencia cuenta contra el estudiante. No incluye viajes patrocinados por la escuela.',
    bullets:['Illness, doctor/dentist appointments, suspensions, and cuts are included in the absence count.','School-sponsored trips are not included.','Special circumstances may require a petition and documentation.'],
    esBullets:['Enfermedad, citas médicas/dentales, suspensiones y cortes cuentan en el número de ausencias.','Viajes patrocinados por la escuela no cuentan.','Circunstancias especiales pueden requerir petición y documentación.']
  },
  {
    id:'ten-absence-answer',
    title:'What happens after 10 absences in a class?',
    esTitle:'¿Qué pasa después de 10 ausencias en una clase?',
    icon:'🔟',
    sectionId:'attendance-requirements',
    category:'Attendance',
    summary:'Saturday School is mandated for each absence over 10, and credit may be lost.',
    esSummary:'Saturday School es obligatorio por cada ausencia sobre 10, y se puede perder crédito.',
    answer:'The handbook says Saturday School will be mandated for each absence exceeding 10 in a course per semester. Students who finish the semester with more than 10 absences in a class will lose credits for that class, even if a passing grade is earned.',
    esAnswer:'El manual dice que Saturday School será obligatorio por cada ausencia que exceda 10 en un curso por semestre. Los estudiantes que terminen el semestre con más de 10 ausencias en una clase perderán créditos para esa clase, incluso si tienen calificación aprobatoria.',
    bullets:['One Saturday School replaces one absence in each class.','This is per course, per semester.','Ask the attendance clerk for an attendance record if you are close to the limit.'],
    esBullets:['Un Saturday School reemplaza una ausencia en cada clase.','Esto es por curso, por semestre.','Pide tu registro de asistencia si estás cerca del límite.']
  },
  {
    id:'saturday-school-answer',
    title:'What is Saturday School for?',
    esTitle:'¿Para qué sirve Saturday School?',
    icon:'🗓️',
    sectionId:'attendance-policy',
    category:'Attendance',
    summary:'It can be used for absences over 10, truancy absences, or disciplinary consequences.',
    esSummary:'Puede usarse para ausencias sobre 10, ausencias de truancy o consecuencias disciplinarias.',
    answer:'Saturday School is mandated for each absence exceeding 10 in a course and/or three or more truancy absences in a course. It may also be used as an alternative consequence for disciplinary actions.',
    esAnswer:'Saturday School es obligatorio por cada ausencia que exceda 10 en un curso y/o tres o más ausencias de truancy en un curso. También puede usarse como consecuencia alternativa por acciones disciplinarias.',
    bullets:['Attendance-related Saturday School can help replace absences.','Discipline-related Saturday School may be assigned separately.','Check the official attendance text below for exact wording.'],
    esBullets:['Saturday School relacionado con asistencia puede ayudar a reemplazar ausencias.','Saturday School disciplinario puede asignarse por separado.','Revisa el texto oficial abajo para el lenguaje exacto.']
  },
  {
    id:'late-answer',
    title:'Am I tardy if I arrive when the bell rings?',
    esTitle:'¿Estoy tarde si llego cuando suena la campana?',
    icon:'⏰',
    sectionId:'tardy-cuts',
    category:'Attendance',
    summary:'Yes. You must be in class when the bell rings, not arriving.',
    esSummary:'Sí. Debes estar en clase cuando suena la campana, no llegando.',
    answer:'Yes. The handbook says if a student is not in class when the bell rings, the student is tardy. Arriving at the door as the bell rings is not the same as being in class.',
    esAnswer:'Sí. El manual dice que si un estudiante no está en clase cuando suena la campana, está tarde. Llegar a la puerta cuando suena la campana no es lo mismo que estar en clase.',
    bullets:['There is a 4-minute passing period between classes.','At four minutes, the tardy bell sounds to designate the start of class.','Students late because another teacher held them over or the office called them need a hall pass.'],
    esBullets:['Hay 4 minutos de pase entre clases.','A los cuatro minutos, suena la campana de tardanza para marcar el inicio de clase.','Estudiantes tarde porque otro maestro los detuvo o porque la oficina los llamó necesitan pase.']
  },
  {
    id:'cut-answer',
    title:'When does a tardy become a cut?',
    esTitle:'¿Cuándo una tardanza se convierte en corte?',
    icon:'✂️',
    sectionId:'tardy-cuts',
    category:'Attendance',
    summary:'Five or more minutes late after the bell is considered a cut.',
    esSummary:'Cinco minutos o más tarde después de la campana se considera corte.',
    answer:'Five or more minutes late to class after the bell rings is considered a cut. The handbook says a class cut results in loss of 5 citizenship points and lunch detention.',
    esAnswer:'Llegar cinco minutos o más tarde a clase después de la campana se considera corte. El manual dice que un corte de clase resulta en pérdida de 5 puntos de ciudadanía y detención de almuerzo.',
    bullets:['Use the handbook number: 5 citizenship points.','A cut is different from a regular tardy because it starts at 5+ minutes late.','Repeated issues can lead to more consequences.'],
    esBullets:['Usa el número del manual: 5 puntos de ciudadanía.','Un corte es diferente de una tardanza regular porque empieza a los 5+ minutos tarde.','Problemas repetidos pueden llevar a más consecuencias.']
  },
  {
    id:'tardy-count-answer',
    title:'What happens if I get 4, 8, or 12+ tardies?',
    esTitle:'¿Qué pasa si tengo 4, 8 o 12+ tardanzas?',
    icon:'📊',
    sectionId:'tardy-cuts',
    category:'Attendance',
    summary:'4 = warning, 8 = point loss and lunch detention, each additional 4 = more consequences.',
    esSummary:'4 = advertencia, 8 = pérdida de puntos y detención de almuerzo, cada 4 adicionales = más consecuencias.',
    answer:'The handbook says 4 tardies results in a warning notice. At 8 tardies, 5 citizenship points are deducted and lunch detention is assigned. With each additional series of 4 tardies—12, 16, 20, etc.—5 citizenship points are deducted and 1 day of After School Detention is assigned.',
    esAnswer:'El manual dice que 4 tardanzas resultan en aviso de advertencia. A las 8 tardanzas, se deducen 5 puntos de ciudadanía y se asigna detención de almuerzo. Con cada serie adicional de 4 tardanzas—12, 16, 20, etc.—se deducen 5 puntos de ciudadanía y se asigna 1 día de detención después de escuela.',
    bullets:['After School Detention is listed as 3:20–6:15.','Habitual tardiness may lead to parent meeting, reassessment contract, or alternative placement consideration.','Use the handbook number: 5 citizenship points.'],
    esBullets:['La detención después de escuela aparece como 3:20–6:15.','Tardanzas habituales pueden llevar a reunión con padres, contrato de reevaluación o consideración de colocación alternativa.','Usa el número del manual: 5 puntos de ciudadanía.']
  },
  {
    id:'tardy-sweep-answer',
    title:'What is a Tardy Sweep?',
    esTitle:'¿Qué es un Tardy Sweep?',
    icon:'🚨',
    sectionId:'tardy-cuts',
    category:'Attendance',
    summary:'Random tardy checks by administration; students caught receive mandatory lunch detention.',
    esSummary:'Revisiones aleatorias de tardanza por administración; estudiantes atrapados reciben detención de almuerzo obligatoria.',
    answer:'Tardy Sweeps are conducted at random by school administration. Students caught in a Tardy Sweep are sent to class once they obtain a pass from an administrator and receive mandatory lunch detention that day or the following day.',
    esAnswer:'Los Tardy Sweeps son realizados al azar por la administración escolar. Los estudiantes atrapados reciben un pase de un administrador para ir a clase y se les asigna detención de almuerzo obligatoria ese día o el siguiente.',
    bullets:['If you hear the sweep cue, get to class immediately.','You still need the administrator pass if you are caught in the sweep.','This card uses the official handbook consequence, not rumors or campus shorthand.'],
    esBullets:['Si escuchas la señal del sweep, ve a clase de inmediato.','Todavía necesitas el pase de administrador si te atrapan en el sweep.','Esta tarjeta usa la consecuencia oficial del manual, no rumores ni frases informales.']
  },
  {
    id:'pass-slip-answer',
    title:'Do I need a pass if I’m late because of a teacher or the office?',
    esTitle:'¿Necesito pase si llego tarde por un maestro o la oficina?',
    icon:'🎫',
    sectionId:'tardy-cuts',
    category:'Attendance',
    summary:'Yes. Students late for those reasons must have a hall pass.',
    esSummary:'Sí. Estudiantes tarde por esas razones deben tener pase.',
    answer:'Yes. The handbook says students late to class because another teacher held them over or because they were summoned to the office must have a hall pass. Students who reach school after 8:10 a.m. must report to the main office for a late slip.',
    esAnswer:'Sí. El manual dice que estudiantes tarde porque otro maestro los detuvo o porque fueron llamados a la oficina deben tener pase. Estudiantes que llegan a la escuela después de 8:10 a.m. deben reportarse a la oficina principal para obtener una boleta de tardanza.',
    bullets:['Without the appropriate pass or slip, students will not be admitted to class.','Get the pass before going to class.','This protects you from being marked incorrectly.'],
    esBullets:['Sin el pase o boleta apropiada, los estudiantes no serán admitidos a clase.','Obtén el pase antes de ir a clase.','Esto te protege de ser marcado incorrectamente.']
  },
  {
    id:'wear-answer',
    title:'Can I wear this?',
    esTitle:'¿Puedo usar esto?',
    icon:'👕',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'It depends. Start with whether it is neat, appropriate, safe, and not prohibited.',
    esSummary:'Depende. Empieza revisando si es limpio, apropiado, seguro y no está prohibido.',
    answer:'It depends. In general, clothing needs to be neat, clean, in acceptable repair, and appropriate for school. The handbook also lists items that are not allowed, and administration makes final determinations.',
    esAnswer:'Depende. En general, la ropa debe estar limpia, en buen estado y ser apropiada para la escuela. El manual también enumera artículos que no se permiten, y la administración toma la decisión final.',
    bullets:['Generally acceptable: school-appropriate clothing, required shoes, appropriate PE/shop footwear, and official school headwear or solid white/gray/black/green hats/caps on campus, removed indoors.','Not allowed includes pajamas except designated spirit days, visible undergarments, undergarments as outerwear, gang-related apparel, profanity, tobacco/alcohol/drug/sex slogans, trench coats, bare midriffs/chests, see-through outfits, off-the-shoulder blouses, spaghetti straps, visible tattoos, and certain sports apparel.','Shorts and skirts must be appropriate length and at minimum reasonably close to mid-thigh. Straps must be at least 1 inch wide.','No solid red or blue apparel except collared shirts, and excessive red or blue may be a violation as determined by administration.'],
    esBullets:['Generalmente aceptable: ropa apropiada para la escuela, zapatos requeridos, calzado apropiado para PE/taller, y gorras/sombreros oficiales de la escuela o sólidos blanco/gris/negro/verde en el campus, pero quitados adentro.','No permitido incluye pijamas excepto días especiales, ropa interior visible, ropa interior como ropa exterior, ropa relacionada con pandillas, groserías, mensajes de tabaco/alcohol/drogas/sexo, gabardinas, abdomen/pecho descubierto, ropa transparente, blusas sin hombros, tirantes delgados, tatuajes visibles y cierta ropa deportiva.','Shorts y faldas deben tener una longitud apropiada y como mínimo estar razonablemente cerca de medio muslo. Los tirantes deben medir por lo menos 1 pulgada.','No se permite ropa sólida roja o azul excepto camisas con cuello, y demasiado rojo o azul puede ser violación según determine la administración.']
  },
  {
    id:'pajamas-answer',
    title:'Can I wear pajamas or a onesie?',
    esTitle:'¿Puedo usar pijamas o un onesie?',
    icon:'🛌',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'No, except on designated dress-up/spirit days such as Pajama Day.',
    esSummary:'No, excepto en días designados de vestimenta/espíritu como Día de Pijama.',
    answer:'No. The handbook says pajamas, including pajama pants and onesies, shall not be worn to school. Certain rules may be relaxed on designated activity, dress-up, or spirit days—for example, pajamas are allowed on Pajama Day.',
    esAnswer:'No. El manual dice que pijamas, incluyendo pantalones de pijama y onesies, no deben usarse en la escuela. Algunas reglas pueden relajarse en días designados de actividad, vestimenta o espíritu; por ejemplo, pijamas se permiten en Día de Pijama.',
    bullets:['Regular day: no pajamas or onesies.','Designated Pajama Day/spirit day: allowed if the school announces it.','When unsure, ask before wearing it.'],
    esBullets:['Día regular: no pijamas ni onesies.','Día designado de pijama/espíritu: permitido si la escuela lo anuncia.','Si tienes duda, pregunta antes de usarlo.']
  },
  {
    id:'red-blue-answer',
    title:'Can I wear red or blue?',
    esTitle:'¿Puedo usar rojo o azul?',
    icon:'🔴',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'No solid red or blue apparel, except collared shirts; excessive red/blue may be a violation.',
    esSummary:'No ropa sólida roja o azul, excepto camisas con cuello; demasiado rojo/azul puede ser violación.',
    answer:'The handbook says no solid red or blue apparel is allowed, with the exception of collared shirts. Students who wear excessive red or blue may be given a dress code violation at the determination of school administration.',
    esAnswer:'El manual dice que no se permite ropa sólida roja o azul, con excepción de camisas con cuello. Estudiantes que usan rojo o azul en exceso pueden recibir una violación del código de vestimenta según determine la administración.',
    bullets:['Collared shirts are the listed exception.','“Excessive” is determined by school administration.','Check the official dress code before spirit outfits or themed clothing.'],
    esBullets:['Camisas con cuello son la excepción indicada.','“Excesivo” lo determina la administración escolar.','Revisa el código oficial antes de ropa temática o de espíritu.']
  },
  {
    id:'tank-top-answer',
    title:'Can I wear a tank top, crop top, or off-the-shoulder top?',
    esTitle:'¿Puedo usar camiseta sin mangas, crop top o blusa sin hombros?',
    icon:'📏',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'Straps must be at least 1 inch; bare midriffs, bare chests, and off-the-shoulder tops are not acceptable.',
    esSummary:'Los tirantes deben medir al menos 1 pulgada; abdomen/pecho descubierto y blusas sin hombros no son aceptables.',
    answer:'It depends on the item. The handbook says straps must be at least 1 inch wide and spaghetti straps are not permitted. It also says halter tops, bare midriffs or bare chests, see-through outfits, and off-the-shoulder blouses are not appropriate or acceptable.',
    esAnswer:'Depende de la prenda. El manual dice que los tirantes deben medir al menos 1 pulgada y no se permiten tirantes delgados. También dice que halter tops, abdomen o pecho descubierto, ropa transparente y blusas sin hombros no son apropiados ni aceptables.',
    bullets:['Half-inch straps are not enough; the handbook says at least 1 inch.','Bare midriff/crop-top looks are not allowed under the official wording.','Administration makes final determinations.'],
    esBullets:['Tirantes de media pulgada no son suficientes; el manual dice al menos 1 pulgada.','Looks con abdomen descubierto/crop top no se permiten según el lenguaje oficial.','La administración toma la decisión final.']
  },
  {
    id:'undergarments-answer',
    title:'Can I wear a bodysuit, lingerie, or shapewear as my outfit?',
    esTitle:'¿Puedo usar bodysuit, lencería o shapewear como outfit?',
    icon:'🚫',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'No. Undergarments may not be worn as outerwear.',
    esSummary:'No. La ropa interior no puede usarse como ropa exterior.',
    answer:'No. The handbook says clothing must conceal undergarments at all times, and undergarments may not be worn as outerwear. It specifically includes onesies, bodysuits, lingerie, or shapewear.',
    esAnswer:'No. El manual dice que la ropa debe cubrir la ropa interior en todo momento, y la ropa interior no puede usarse como ropa exterior. Específicamente incluye onesies, bodysuits, lencería o shapewear.',
    bullets:['Conceal undergarments at all times.','Do not wear undergarments as the outfit.','A belt may be required to support pants at the waist.'],
    esBullets:['Cubre la ropa interior en todo momento.','No uses ropa interior como outfit.','Puede requerirse un cinturón para sostener pantalones en la cintura.']
  },
  {
    id:'hair-answer',
    title:'Can I have unnatural hair color?',
    esTitle:'¿Puedo tener color de cabello no natural?',
    icon:'💇',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'No. Hair must be a naturally occurring color.',
    esSummary:'No. El cabello debe ser de un color natural.',
    answer:'No. The handbook says hair and facial hair shall be neatly groomed, and hair shall be a naturally occurring color such as black, brown, blond, or natural red.',
    esAnswer:'No. El manual dice que el cabello y vello facial deben estar arreglados, y el cabello debe ser de un color natural como negro, café, rubio o rojo natural.',
    bullets:['Unusual or extreme designs, colors, symbols, razor cuts, or messages are not permitted.','Natural color examples are listed in the handbook.','Ask administration before making a major change if you are unsure.'],
    esBullets:['Diseños, colores, símbolos, cortes de navaja o mensajes inusuales/extremos no se permiten.','El manual da ejemplos de colores naturales.','Pregunta a administración antes de un cambio grande si tienes duda.']
  },
  {
    id:'hats-tattoos-answer',
    title:'Can I wear a hat, hood, sunglasses, or show tattoos?',
    esTitle:'¿Puedo usar gorra, capucha, lentes de sol o mostrar tatuajes?',
    icon:'🧢',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'Some hats are allowed on campus, but hats/hoods/sunglasses come off indoors; tattoos must be covered.',
    esSummary:'Algunas gorras se permiten en campus, pero gorras/capuchas/lentes se quitan adentro; tatuajes deben cubrirse.',
    answer:'Official school headwear and solid white, gray, black, or green hats/caps may be worn on campus. Hats, hoods, and sunglasses must be removed indoors. Tattoos, permanent or temporary, must be covered at all times.',
    esAnswer:'La gorra/sombrero oficial de la escuela y gorras/sombreros sólidos blanco, gris, negro o verde pueden usarse en el campus. Gorras, capuchas y lentes de sol deben quitarse dentro de edificios. Los tatuajes, permanentes o temporales, deben estar cubiertos en todo momento.',
    bullets:['Allowed campus hat colors: white, gray, black, green, or official school headwear.','Remove hats, hoods, and sunglasses indoors.','Cover tattoos at all times.'],
    esBullets:['Colores de gorras permitidos en campus: blanco, gris, negro, verde u oficial de la escuela.','Quita gorras, capuchas y lentes de sol adentro.','Cubre tatuajes en todo momento.']
  },
  {
    id:'sports-apparel-answer',
    title:'Can I wear sports team clothing?',
    esTitle:'¿Puedo usar ropa de equipos deportivos?',
    icon:'🏈',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'Some college/professional team apparel is prohibited; Fresno State has a special rule.',
    esSummary:'Algunas prendas de equipos universitarios/profesionales están prohibidas; Fresno State tiene regla especial.',
    answer:'Some college/professional team sports apparel is prohibited by the handbook. Fresno State apparel is allowed only if it does not contain the Bulldogs logo. Any apparel with a bulldog is not allowed, whether or not it is associated with a sports team.',
    esAnswer:'Algunas prendas de equipos universitarios/profesionales están prohibidas por el manual. Ropa de Fresno State se permite solo si no contiene el logo de Bulldogs. Cualquier ropa con un bulldog no se permite, esté o no asociada con un equipo.',
    bullets:['Check the official prohibited sports apparel list below before wearing team gear.','Fresno State: allowed only without the Bulldogs logo.','Any bulldog apparel is not allowed.'],
    esBullets:['Revisa la lista oficial de ropa deportiva prohibida abajo antes de usar ropa de equipos.','Fresno State: permitido solo sin el logo de Bulldogs.','Cualquier ropa con bulldog no se permite.']
  },
  {
    id:'leave-answer',
    title:'Can I leave campus?',
    esTitle:'¿Puedo salir del campus?',
    icon:'🚪',
    sectionId:'closed-campus-permits',
    category:'Student Services',
    summary:'Not without main office clearance and parent/guardian consent where required.',
    esSummary:'No sin autorización de la oficina principal y consentimiento del padre/tutor cuando sea requerido.',
    answer:'RHS is a closed campus. Students may not leave during the school day, including lunch, unless the departure is cleared through the main office. Off-campus permits are issued through the main office with parent/guardian consent.',
    esAnswer:'RHS es un campus cerrado. Los estudiantes no pueden salir durante el día escolar, incluyendo el almuerzo, a menos que la salida sea autorizada por la oficina principal. Los permisos para salir se emiten en la oficina principal con consentimiento del padre/madre/tutor.',
    bullets:['Do not leave campus and then return during the day without office clearance.','Illness must be verified by school personnel before leaving sick.','Students will not be released to anyone not listed on the contact list.'],
    esBullets:['No salgas del campus y regreses durante el día sin autorización de la oficina.','La enfermedad debe ser verificada por personal escolar antes de salir enfermo.','No se entregará al estudiante a nadie que no esté en la lista de contactos.']
  },
  {
    id:'after-school-answer',
    title:'Can I leave and come back after school if I’m staying for athletics or ELP?',
    esTitle:'¿Puedo irme y regresar después de clases si me quedo para deportes o ELP?',
    icon:'🏃',
    sectionId:'expanded-learning',
    category:'Student Services',
    summary:'For ELP, the handbook says students may not leave between the end of classes and the start of ELP.',
    esSummary:'Para ELP, el manual dice que los estudiantes no pueden salir entre el final de clases y el inicio de ELP.',
    answer:'For Expanded Learning Program, the handbook says students may not leave campus between the end of classes and the start time of ELP. Students must sign in to their assigned ELP area and may not leave after signing in unless given permission by the ASP supervisor. For athletics or other after-school situations, students should stay in a designated adult-supervised area and follow staff directions.',
    esAnswer:'Para el Programa de Aprendizaje Extendido, el manual dice que los estudiantes no pueden salir del campus entre el final de clases y la hora de inicio de ELP. Los estudiantes deben registrarse en su área asignada y no pueden salir después de registrarse a menos que reciban permiso del supervisor ASP. Para deportes u otras situaciones después de clases, deben permanecer en un área designada supervisada por un adulto y seguir instrucciones del personal.',
    bullets:['ELP runs from the time school is out until 6:00 p.m.','Late bus departs at 6:15 p.m. from the bus parking lot.','ELP sign-in: by 3:25 on regular days and 2:10 on Early Release Mondays.'],
    esBullets:['ELP funciona desde que termina la escuela hasta las 6:00 p.m.','El autobús tarde sale a las 6:15 p.m. del estacionamiento de autobuses.','Registro ELP: antes de 3:25 en días regulares y 2:10 en lunes de salida temprana.']
  },
  {
    id:'eighteen-checkout-answer',
    title:'If I’m 18, can I check myself out?',
    esTitle:'Si tengo 18 años, ¿puedo salir por mi cuenta?',
    icon:'❓',
    sectionId:'closed-campus-permits',
    category:'Student Services',
    summary:'The handbook does not clearly answer this. Check with the main office.',
    esSummary:'El manual no responde esto claramente. Consulta con la oficina principal.',
    answer:'The handbook does not clearly state that an 18-year-old student may check themselves out. Because this involves attendance and release procedures, students should check with the main office. Until clarified by the school, follow the regular checkout process.',
    esAnswer:'El manual no indica claramente que un estudiante de 18 años pueda salir por su cuenta. Como esto implica asistencia y procedimientos de salida, los estudiantes deben consultar con la oficina principal. Hasta que la escuela lo aclare, sigan el proceso regular de salida.',
    bullets:['This is marked as “Office clarification needed.”','Do not assume age 18 automatically changes school checkout procedures.','Ask the main office for the current district/school rule.'],
    esBullets:['Esto está marcado como “Se necesita aclaración de la oficina.”','No asumas que tener 18 años cambia automáticamente los procedimientos escolares de salida.','Pregunta en la oficina principal por la regla actual del distrito/escuela.']
  },
  {
    id:'eighteen-fieldtrip-answer',
    title:'If I’m 18, do my parents still need to sign a field trip permission slip?',
    esTitle:'Si tengo 18 años, ¿mis padres aún deben firmar un permiso de excursión?',
    icon:'🚌',
    sectionId:'student-services',
    category:'Student Services',
    summary:'The handbook does not clearly answer this. Ask the office, teacher, or administrator.',
    esSummary:'El manual no responde esto claramente. Pregunta en la oficina, al maestro o a un administrador.',
    answer:'The handbook does not clearly answer whether an 18-year-old student can sign their own field trip permission slip. Because field trips involve school liability and district procedure, ask the office, teacher, or administrator which signature is required.',
    esAnswer:'El manual no responde claramente si un estudiante de 18 años puede firmar su propio permiso de excursión. Como las excursiones implican responsabilidad escolar y procedimientos del distrito, pregunta en la oficina, al maestro o a un administrador qué firma se requiere.',
    bullets:['This is marked as “Office clarification needed.”','Use the official form and signature requirements provided for that trip.','Do not guess—field trip requirements can involve district policy outside this handbook.'],
    esBullets:['Esto está marcado como “Se necesita aclaración de la oficina.”','Usa el formulario oficial y los requisitos de firma dados para esa excursión.','No adivines: los requisitos pueden involucrar política del distrito fuera de este manual.']
  },
  {
    id:'activity-answer',
    title:'Can I go to a dance/game/activity?',
    esTitle:'¿Puedo ir a un baile/juego/actividad?',
    icon:'🎟️',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'Check citizenship points, the Nonprivileged List, and eligibility rules.',
    esSummary:'Revisa puntos de ciudadanía, Lista Sin Privilegios y reglas de elegibilidad.',
    answer:'Maybe. Students on the Nonprivileged List may not attend RUSD extracurricular or co-curricular activities beyond curriculum expectations, including athletic events, club/class activities, and dances.',
    esAnswer:'Tal vez. Los estudiantes en la Lista Sin Privilegios no pueden asistir a actividades extracurriculares o co-curriculares de RUSD más allá de los requisitos del currículo, incluyendo eventos deportivos, actividades de clubes/clases y bailes.',
    bullets:['Students start each quarter with 40 citizenship points.','Below 25 points = one week on the Nonprivileged List, with additional consequences at lower point levels.','Grades/eligibility can also matter for extra-curricular activities.'],
    esBullets:['Los estudiantes comienzan cada trimestre con 40 puntos de ciudadanía.','Menos de 25 puntos = una semana en la Lista Sin Privilegios, con consecuencias adicionales en niveles más bajos.','Las calificaciones/elegibilidad también pueden importar para actividades extracurriculares.']
  },
  {
    id:'citizenship-points-answer',
    title:'How do citizenship points work?',
    esTitle:'¿Cómo funcionan los puntos de ciudadanía?',
    icon:'⭐',
    sectionId:'nonprivileged-dress',
    category:'Discipline & Conduct',
    summary:'Students start each quarter with 40 points. Falling below certain levels leads to the Nonprivileged List.',
    esSummary:'Los estudiantes empiezan cada trimestre con 40 puntos. Bajar de ciertos niveles lleva a Lista Sin Privilegios.',
    answer:'Every student begins each quarter with 40 citizenship points. Points are deducted for noted discipline offenses. Students below 25 points earn one week on the Nonprivileged List, and lower point levels bring additional consequences. The handbook says points cannot be earned back during the quarter and are re-established at the end of each quarter.',
    esAnswer:'Cada estudiante empieza cada trimestre con 40 puntos de ciudadanía. Se deducen puntos por infracciones disciplinarias. Estudiantes con menos de 25 puntos reciben una semana en la Lista Sin Privilegios, y niveles más bajos traen consecuencias adicionales. El manual dice que los puntos no pueden recuperarse durante el trimestre y se restablecen al final de cada trimestre.',
    bullets:['Below 25 points: 1 week on Nonprivileged List.','Below 15, 10, and 5 points: additional consequences listed in the official text.','0 points: student may be considered for reassessment contract or alternative educational program.'],
    esBullets:['Menos de 25 puntos: 1 semana en Lista Sin Privilegios.','Menos de 15, 10 y 5 puntos: consecuencias adicionales en el texto oficial.','0 puntos: el estudiante puede ser considerado para contrato de reevaluación o programa alternativo.']
  },
  {
    id:'parking-answer',
    title:'Can I drive or park on campus?',
    esTitle:'¿Puedo manejar o estacionarme en el campus?',
    icon:'🚗',
    sectionId:'student-services',
    category:'Student Services',
    summary:'Check student vehicles and parking rules in Student Services.',
    esSummary:'Revisa las reglas de vehículos y estacionamiento en Servicios Estudiantiles.',
    answer:'Use the Student Services section for the official vehicle and parking rules. The helper answer is: driving/parking is allowed only under the handbook rules, and students are responsible for following campus parking expectations.',
    esAnswer:'Usa la sección de Servicios Estudiantiles para las reglas oficiales de vehículos y estacionamiento. La respuesta de ayuda es: manejar/estacionarse solo se permite bajo las reglas del manual, y los estudiantes son responsables de cumplir las expectativas de estacionamiento.',
    bullets:['Open the official text below and look for Student Vehicles and Student Parking.','When in doubt, check with the main office before parking on campus.'],
    esBullets:['Abre el texto oficial abajo y busca Vehículos Estudiantiles y Estacionamiento Estudiantil.','Si tienes duda, consulta con la oficina principal antes de estacionarte en el campus.']
  },
  {
    id:'workpermit-answer',
    title:'How do I get a work permit?',
    esTitle:'¿Cómo obtengo un permiso de trabajo?',
    icon:'💼',
    sectionId:'student-services',
    category:'Student Services',
    summary:'Start in Student Services and follow the official work permit process.',
    esSummary:'Empieza en Servicios Estudiantiles y sigue el proceso oficial de permiso de trabajo.',
    answer:'Use the Student Services section for the official work permit information. The helper answer is: start with the school office/counseling process and follow the handbook requirements before beginning work that requires a permit.',
    esAnswer:'Usa la sección de Servicios Estudiantiles para la información oficial sobre permisos de trabajo. La respuesta de ayuda es: empieza con la oficina escolar/consejería y sigue los requisitos del manual antes de comenzar un trabajo que requiera permiso.',
    bullets:['Open the official text below and look for Work Permits.','Ask the office/counselor for the correct form and current steps.'],
    esBullets:['Abre el texto oficial abajo y busca Permisos de Trabajo.','Pregunta en la oficina/consejería por el formulario correcto y los pasos actuales.']
  },
  {
    id:'schedule-answer',
    title:'What schedule are we on?',
    esTitle:'¿Qué horario tenemos?',
    icon:'🔔',
    sectionId:'bell-schedules',
    category:'Reference',
    summary:'Use the bell schedule page for regular, early release, block, activity, minimum, and foggy schedules.',
    esSummary:'Usa la página de horarios para días regular, salida temprana, bloque, actividad, mínimo y neblina.',
    answer:'The handbook includes multiple bell schedules. First identify the day type—regular, early release, Wednesday/Thursday block, activity, minimum day, or foggy/late arrival—then use the matching schedule.',
    esAnswer:'El manual incluye varios horarios. Primero identifica el tipo de día—regular, salida temprana, bloque miércoles/jueves, actividad, día mínimo o neblina/llegada tarde—y usa el horario correspondiente.',
    bullets:['Passing time is listed as four minutes.','Foggy/late arrival schedules have separate times.','If weather is involved, also check Foggy Day Information.'],
    esBullets:['El tiempo entre clases aparece como cuatro minutos.','Los horarios de neblina/llegada tarde tienen horas separadas.','Si el clima está involucrado, revisa también Información de Días con Neblina.']
  },
  {
    id:'foggy-answer',
    title:'What if it is foggy?',
    esTitle:'¿Qué pasa si hay neblina?',
    icon:'🌫️',
    sectionId:'foggy-day',
    category:'Reference',
    summary:'Check Plan A, B, or C and transportation updates.',
    esSummary:'Revisa Plan A, B o C y actualizaciones de transporte.',
    answer:'Foggy days are announced as Plan A, Plan B, or Plan C. The handbook says families can check the Southwest Transportation Agency website, Channel 18, and listed radio stations for foggy day schedule information.',
    esAnswer:'Los días con neblina se anuncian como Plan A, Plan B o Plan C. El manual dice que las familias pueden revisar el sitio de Southwest Transportation Agency, Canal 18 y estaciones de radio indicadas para información del horario.',
    bullets:['Plan A: classes start at 10:00 a.m.; buses run about 1 hour 45 minutes later.','Plan B: buses run about 2 hours 45 minutes later; classes still start at 10:00 a.m.','Plan C: morning buses are canceled; afternoon buses transport students; classes start at 10:00 a.m.'],
    esBullets:['Plan A: clases empiezan a las 10:00 a.m.; autobuses corren aprox. 1 hora 45 minutos tarde.','Plan B: autobuses corren aprox. 2 horas 45 minutos tarde; clases empiezan a las 10:00 a.m.','Plan C: autobuses de la mañana se cancelan; autobuses de la tarde transportan estudiantes; clases empiezan a las 10:00 a.m.']
  }

  ,
  {
    id:'contact-school-answer',
    title:'How do I contact the school?',
    esTitle:'¿Cómo me comunico con la escuela?',
    icon:'☎️',
    sectionId:'admin-contact',
    category:'Welcome & General Info',
    summary:'Use this card for the main RHS address, phone numbers, fax, and administration contact starting point.',
    esSummary:'Usa esta tarjeta para la dirección principal de RHS, teléfonos, fax y punto de inicio para contactar administración.',
    answer:'Start with the main office. Riverdale High School is listed at P.O. Box 726, 3086 West Mount Whitney, Riverdale, CA 93656. The handbook lists phone numbers (559) 867-3562 and (559) 891-4400, and fax (559) 867-3401.',
    esAnswer:'Empieza con la oficina principal. Riverdale High School aparece con P.O. Box 726, 3086 West Mount Whitney, Riverdale, CA 93656. El manual indica los teléfonos (559) 867-3562 y (559) 891-4400, y fax (559) 867-3401.',
    bullets:['Use the main office as the first stop when you are not sure who to contact.','For attendance, follow the attendance call procedures listed in the Attendance Policy.','For academics, graduation, college, attendance, or discipline questions, see the Student Advisement card.'],
    esBullets:['Usa la oficina principal como primer lugar cuando no sabes a quién contactar.','Para asistencia, sigue los procedimientos de llamada de la Política de Asistencia.','Para preguntas sobre clases, graduación, universidad, asistencia o disciplina, revisa la tarjeta de Asesoramiento Estudiantil.']
  },
  {
    id:'who-to-talk-to-answer',
    title:'Who do I talk to about grades, attendance, graduation, college, or discipline?',
    esTitle:'¿Con quién hablo sobre calificaciones, asistencia, graduación, universidad o disciplina?',
    icon:'🧑‍🏫',
    sectionId:'grades-report-cards',
    category:'Welcome & General Info',
    summary:'Start with the College and Career Counselor or your assigned Assistant Principal, with a parent as needed.',
    esSummary:'Empieza con el Consejero de Colegio y Carrera o tu Subdirector asignado, con un padre/tutor si es necesario.',
    answer:'The handbook’s Student Advisement section says students meet with the College and Career Counselor or their assigned Assistant Principal, and their parent as needed, to discuss academics, career choices, graduation requirements, college choices/entrance, scholarships, attendance, and discipline.',
    esAnswer:'La sección de Asesoramiento Estudiantil del manual dice que los estudiantes se reúnen con el Consejero de Colegio y Carrera o su Subdirector asignado, y su padre/tutor según sea necesario, para hablar de clases, carreras, requisitos de graduación, entrada a la universidad, becas, asistencia y disciplina.',
    bullets:['Use this when you are not sure whether your question is academic, attendance-related, college-related, or discipline-related.','Do not wait until senior year to ask about credits or college requirements.','Parents/guardians may be included as needed.'],
    esBullets:['Usa esto cuando no sabes si tu pregunta es académica, de asistencia, universitaria o disciplinaria.','No esperes hasta el último año para preguntar sobre créditos o requisitos universitarios.','Padres/tutores pueden participar según sea necesario.']
  },
  {
    id:'eligibility-activities-answer',
    title:'What do I need to participate in sports, clubs, dances, or school activities?',
    esTitle:'¿Qué necesito para participar en deportes, clubes, bailes o actividades escolares?',
    icon:'🏅',
    sectionId:'grades-report-cards',
    category:'Student Services',
    summary:'Check grades, GPA, failing grades, citizenship points, and Nonprivileged List status.',
    esSummary:'Revisa calificaciones, GPA, materias reprobadas, puntos de ciudadanía y si estás en Lista Sin Privilegios.',
    answer:'Eligibility for extracurricular activities, including dances, is based on quarter grade reports. Students are declared ineligible if they are below a 2.0 GPA and/or have one or more failing grades. Students also need to pay attention to citizenship points and the Nonprivileged List.',
    esAnswer:'La elegibilidad para actividades extracurriculares, incluyendo bailes, se basa en las calificaciones trimestrales. Los estudiantes son declarados inelegibles si tienen menos de 2.0 GPA y/o una o más calificaciones reprobadas. También deben cuidar sus puntos de ciudadanía y la Lista Sin Privilegios.',
    bullets:['Quarter grade reports matter for eligibility.','Below 2.0 GPA and/or one or more failing grades can make a student ineligible.','Being on the Nonprivileged List can block attendance at extracurricular or co-curricular activities beyond curriculum expectations.'],
    esBullets:['Las calificaciones trimestrales importan para la elegibilidad.','Menos de 2.0 GPA y/o una o más calificaciones reprobadas puede hacer que un estudiante sea inelegible.','Estar en la Lista Sin Privilegios puede impedir asistir a actividades extracurriculares o co-curriculares más allá de los requisitos del currículo.']
  },
  {
    id:'petition-eligibility-answer',
    title:'Can I petition if I’m ineligible?',
    esTitle:'¿Puedo pedir una excepción si estoy inelegible?',
    icon:'📝',
    sectionId:'grades-report-cards',
    category:'Student Services',
    summary:'Yes. The handbook says students may petition for eligibility during one quarter each school year.',
    esSummary:'Sí. El manual dice que los estudiantes pueden pedir elegibilidad durante un trimestre cada año escolar.',
    answer:'Yes. The handbook says students may petition for eligibility during one quarter each school year. Because petitions affect activities and eligibility, students should ask the office, counselor, or administrator about the current process and deadline.',
    esAnswer:'Sí. El manual dice que los estudiantes pueden pedir elegibilidad durante un trimestre cada año escolar. Como las peticiones afectan actividades y elegibilidad, los estudiantes deben preguntar en la oficina, consejería o administración por el proceso y fecha límite actual.',
    bullets:['The handbook allows a petition during one quarter each school year.','A petition does not mean automatic approval.','Ask early so you do not miss deadlines for sports, dances, trips, or activities.'],
    esBullets:['El manual permite una petición durante un trimestre cada año escolar.','Una petición no significa aprobación automática.','Pregunta temprano para no perder fechas límite de deportes, bailes, viajes o actividades.']
  },
  {
    id:'fieldtrip-nonprivileged-answer',
    title:'Can I go on a field trip if I’m nonprivileged or ineligible?',
    esTitle:'¿Puedo ir a una excursión si estoy sin privilegios o inelegible?',
    icon:'🚌',
    sectionId:'nonprivileged-dress',
    category:'Student Services',
    summary:'Maybe. Required class trips may be different from optional, club, reward, or privilege-based trips.',
    esSummary:'Tal vez. Viajes requeridos por una clase pueden ser diferentes de viajes opcionales, de club, recompensa o privilegio.',
    answer:'Maybe, but do not assume. If the field trip is required as part of a regular class or curriculum activity, it may be treated differently than an optional activity. If the trip is extracurricular, co-curricular beyond curriculum requirements, a club/class activity, reward trip, or privilege-based trip, students who are nonprivileged or academically ineligible may not be allowed to attend. Check with the office, teacher, or administrator before the trip.',
    esAnswer:'Tal vez, pero no lo asumas. Si la excursión es requerida como parte de una clase regular o actividad del currículo, puede tratarse de manera diferente a una actividad opcional. Si el viaje es extracurricular, co-curricular más allá de los requisitos del currículo, una actividad de club/clase, viaje de recompensa o basado en privilegios, los estudiantes sin privilegios o académicamente inelegibles pueden no poder asistir. Consulta con la oficina, maestro o administrador antes del viaje.',
    bullets:['Nonprivileged students may not attend extracurricular or co-curricular activities beyond curriculum expectations.','Academic ineligibility can also affect extracurricular participation.','Ask before the trip so there is no confusion on permission slips, buses, or activity lists.'],
    esBullets:['Los estudiantes sin privilegios no pueden asistir a actividades extracurriculares o co-curriculares más allá de las expectativas del currículo.','La inelegibilidad académica también puede afectar la participación extracurricular.','Pregunta antes del viaje para evitar confusión con permisos, autobuses o listas de actividad.']
  },
  {
    id:'run-asb-class-office-answer',
    title:'What do I need to run for ASB or class office?',
    esTitle:'¿Qué necesito para postularme para ASB o mesa directiva de clase?',
    icon:'🗳️',
    sectionId:'student-government',
    category:'Student Government',
    summary:'Students need a 3.25 cumulative GPA, academic eligibility, acceptable citizenship, and willingness to serve.',
    esSummary:'Los estudiantes necesitan GPA acumulado de 3.25, elegibilidad académica, ciudadanía aceptable y disposición para servir.',
    answer:'For ASB and class office, the handbook lists a minimum 3.25 cumulative GPA, academic eligibility at the time of elections, maintaining eligibility while in office, acceptable citizenship, willingness to work outside school hours, involvement in extracurricular activities, and campaign/speech expectations. Class office also includes meeting and event participation expectations.',
    esAnswer:'Para ASB y mesa directiva de clase, el manual indica un GPA acumulado mínimo de 3.25, elegibilidad académica al momento de elecciones, mantener elegibilidad durante el cargo, ciudadanía aceptable, disposición para trabajar fuera del horario escolar, participación extracurricular y expectativas de campaña/discurso. La mesa directiva de clase también incluye expectativas de asistencia a reuniones y eventos.',
    bullets:['ASB/class officers serve one year and are elected in the spring before their term.','Students running for ASB or class office use the popular vote method; run-off may occur if needed.','Club office elections follow the club’s by-laws.'],
    esBullets:['Los oficiales de ASB/clase sirven un año y son elegidos en la primavera antes de su periodo.','Los estudiantes que se postulan para ASB o clase usan voto popular; puede haber segunda vuelta si es necesario.','Las elecciones de clubes siguen los reglamentos del club.']
  },
  {
    id:'club-link-crew-leadership-answer',
    title:'What do I need for club office, Link Crew, or Leadership?',
    esTitle:'¿Qué necesito para un cargo de club, Link Crew o Leadership?',
    icon:'🤝',
    sectionId:'student-government',
    category:'Student Government',
    summary:'The handbook lists GPA, eligibility, outside-hours work, and involvement requirements.',
    esSummary:'El manual enumera requisitos de GPA, elegibilidad, trabajo fuera de horario y participación.',
    answer:'For club office, Link Crew, and Leadership, the handbook lists a minimum 3.25 cumulative GPA, academic eligibility at the time of elections, maintaining eligibility while in office, willingness to work during non-school hours when requested, and involvement in the organization’s extracurricular activities.',
    esAnswer:'Para cargos de club, Link Crew y Leadership, el manual indica un GPA acumulado mínimo de 3.25, elegibilidad académica al momento de elecciones, mantener elegibilidad durante el cargo, disposición para trabajar fuera del horario escolar cuando se solicite, y participación en las actividades extracurriculares de la organización.',
    bullets:['Ask the club advisor or Activities Director for current details.','Some organizations may have extra requirements in their own by-laws.','Eligibility must be maintained, not just met once.'],
    esBullets:['Pregunta al asesor del club o Director de Actividades por detalles actuales.','Algunas organizaciones pueden tener requisitos adicionales en sus propios reglamentos.','La elegibilidad debe mantenerse, no solo cumplirse una vez.']
  },
  {
    id:'class-advisors-answer',
    title:'Who are the ASB and class officers/advisors?',
    esTitle:'¿Quiénes son los oficiales/asesores de ASB y de clase?',
    icon:'📋',
    sectionId:'student-government',
    category:'Student Government',
    summary:'Use the Student Government section to find ASB officers, class officers, advisors, school colors, and mascot.',
    esSummary:'Usa la sección de Gobierno Estudiantil para encontrar oficiales de ASB, oficiales de clase, asesores, colores y mascota.',
    answer:'The handbook lists Student Body Officers/Advisors for 2025–26, including ASB officers, the Activities Director/Advisor, class officers, and class advisors. Use the official Student Government text below for the current names exactly as listed.',
    esAnswer:'El manual enumera Oficiales/Asesores del Cuerpo Estudiantil para 2025–26, incluyendo oficiales de ASB, Director/Asesor de Actividades, oficiales de clase y asesores de clase. Usa el texto oficial de Gobierno Estudiantil abajo para ver los nombres actuales exactamente como aparecen.',
    bullets:['Activities Director/Advisor listed: Mr. Hughes.','Senior, junior, sophomore, and freshman class advisor information is listed in the official text.','School colors: green and white; mascot: Cowboys.'],
    esBullets:['Director/Asesor de Actividades indicado: Mr. Hughes.','La información de asesores de senior, junior, sophomore y freshman aparece en el texto oficial.','Colores escolares: verde y blanco; mascota: Cowboys.']
  }];
let activePopular = popularTopics[0];
function popularTitle(pt){ return helperLang==='es' ? (pt.esTitle || pt.title) : pt.title; }
function popularSummary(pt){ return helperLang==='es' ? (pt.esSummary || pt.summary) : pt.summary; }
function popularAnswer(pt){ return helperLang==='es' ? (pt.esAnswer || pt.answer) : pt.answer; }
function popularBullets(pt){ return helperLang==='es' ? (pt.esBullets || pt.bullets) : pt.bullets; }


function t(){ return UI[helperLang]; }
function iconFor(cat){return {'Welcome & General Info':'🏫','Academics & Graduation':'🎓','Attendance':'🕒','Discipline & Conduct':'🤠','Student Services':'🧰','Student Government':'🗳️','Reference':'🗺️'}[cat] || '📘'}
function esc(str=''){return String(str).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));}
function titleFor(s){ return helperLang==='es' ? (titleES[s.title] || s.title) : s.title; }
function catFor(cat){ return helperLang==='es' ? (categoryLabels.es[cat] || cat) : cat; }
function helper(s, field){ return helperLang==='es' && s.es && s.es[field] ? s.es[field] : s[field]; }
function keysFor(s){ return helperLang==='es' && s.es && s.es.keys ? s.es.keys : s.keys; }
function scenarioTitle(sc, idx){ return helperLang==='es' && sc.es ? sc.es.title : sc.title; }
function scenarioSummary(sc){ return helperLang==='es' && sc.es ? sc.es.summary : sc.summary; }

function snippet(text, q){
  const lower=text.toLowerCase(), idx=lower.indexOf(q.toLowerCase());
  if(idx<0) return esc(text.slice(0,160))+'…';
  const start=Math.max(0,idx-70), end=Math.min(text.length,idx+120);
  return esc(text.slice(start,end)).replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'ig'),'<mark>$1</mark>') + (end<text.length?'…':'');
}

function renderLanguageToggle(){
  const enBtn = $('#helperEnglish');
  const esBtn = $('#helperSpanish');
  if(!enBtn || !esBtn) return;
  enBtn.classList.toggle('active', helperLang==='en');
  esBtn.classList.toggle('active', helperLang==='es');
  enBtn.setAttribute('aria-pressed', helperLang==='en');
  esBtn.setAttribute('aria-pressed', helperLang==='es');
}

function renderStaticLabels(){
  $('#showAllBtn').textContent = t().showAll;
  const headings = $$('.section-heading');
  if(headings[0]){ headings[0].querySelector('.eyebrow').textContent = t().popularTopics; headings[0].querySelector('h2').textContent = t().startHere; }
  const howTo = $('#howToUseCard');
  if(howTo){
    howTo.innerHTML = `<strong>${esc(t().howToTitle)}</strong><span>${esc(t().howToText)}</span>`;
  }
}

function renderCategories(){
  $('#categoryList').innerHTML = cats.map(c => `<button class="cat-btn ${c===activeCategory?'active':''}" data-cat="${esc(c)}">${c==='All Sections'?'📚':iconFor(c)} ${esc(catFor(c))}</button>`).join('');
  $('#categoryFilter').innerHTML = cats.map(c => `<option value="${esc(c)}" ${c===activeCategory?'selected':''}>${esc(catFor(c))}</option>`).join('');
  $$('.cat-btn').forEach(b=>b.addEventListener('click',()=>{activeCategory=b.dataset.cat; renderAll();}));
  $('#categoryFilter').onchange = e => {activeCategory=e.target.value; renderAll();};
}
function visibleSections(){return activeCategory==='All Sections'?sections:sections.filter(s=>s.category===activeCategory)}

const TOPIC_PRIORITY = [
  'absent-answer',
  'ten-absence-answer',
  'late-answer',
  'tardy-count-answer',
  'wear-answer',
  'graduate-answer',
  'missing-credit-answer',
  'eligibility-activities-answer',
  'leave-answer',
  'foggy-answer',
  'illness-excused-answer',
  'absences-count-answer',
  'cut-answer',
  'pajamas-answer',
  'red-blue-answer',
  'parking-answer',
  'workpermit-answer',
  'contact-school-answer',
  'who-to-talk-to-answer',
  'fieldtrip-nonprivileged-answer',
  'eighteen-checkout-answer',
  'eighteen-fieldtrip-answer'
];
function topicRank(topic){
  const id = topic && topic.id ? topic.id : '';
  const index = TOPIC_PRIORITY.indexOf(id);
  return index === -1 ? 999 : index;
}
function isOfficeClarification(topic){
  const id = topic && topic.id ? topic.id : '';
  return id === 'eighteen-checkout-answer' || id === 'eighteen-fieldtrip-answer';
}

function renderTopics(){
  const base = (activeCategory==='All Sections' ? popularTopics : popularTopics.filter(pt => pt.category===activeCategory)).slice().sort((a,b)=>topicRank(a)-topicRank(b));
  $('#topicCards').innerHTML = base.map(pt => `<article class="topic-card ${activePopular && activePopular.id===pt.id?'active-topic':''} ${isOfficeClarification(pt)?'needs-office':''}" data-topic="${pt.id}"><span class="badge">${pt.icon} ${esc(catFor(pt.category))}</span>${isOfficeClarification(pt)?`<span class="office-badge">${esc(t().officeBadgeShort)}</span>`:''}<h3>${esc(popularTitle(pt))}</h3><p>${esc(popularSummary(pt))}</p><small class="answer-chip">${esc(helperLang==='es'?'Ver respuesta':'Get the answer')}</small></article>`).join('') || `<div class="empty-card">${esc(helperLang==='es'?'No hay preguntas populares en esta categoría todavía. Usa las secciones de la izquierda.':'No popular questions in this category yet. Use the sections on the left.')}</div>`;
  $$('.topic-card[data-topic]').forEach(card => card.addEventListener('click',()=>openPopularTopic(card.dataset.topic)));
}
function renderScenarios(){
  const holder = $('#scenarioCards');
  if(!holder) return;
  holder.innerHTML = scenarios.map((sc,i) => `<article class="scenario-card" data-id="${sc.sectionId}"><div class="icon">${sc.icon}</div><h3>${esc(scenarioTitle(sc,i))}</h3><p>${esc(scenarioSummary(sc))}</p></article>`).join('');
  $$('.scenario-card').forEach(card => card.addEventListener('click',()=>openSection(card.dataset.id)));
}
function relatedButtons(s){
  const rel = sections.filter(x => x.category===s.category && x.id!==s.id).slice(0,5);
  return rel.map(r=>`<button data-id="${r.id}">${esc(titleFor(r))}</button>`).join('');
}
function renderSection(){
  const s = activeSection;
  let body;
  const pdfPage = (s.pdfPages && s.pdfPages.length ? s.pdfPages[0] : (s.pdfStart || 1));
  const pdfUrl = `assets/RHS-Parent-Student-Handbook-2025-26.pdf#page=${pdfPage}&zoom=page-width`;
  if(activeTab==='official'){
    body = `<p class="pdf-tip">${esc(t().pdfTip)}</p><div class="official-text">${esc(s.officialText)}</div>`;
  } else if(activeTab==='pdf'){
    body = `<div class="pdf-viewer-wrap"><p class="pdf-hint">${esc(t().pdfHint)}</p><iframe class="pdf-frame" src="${pdfUrl}" title="${esc(titleFor(s))} original PDF page ${pdfPage}"></iframe><a class="pdf-page-link" href="${pdfUrl}" target="_blank" rel="noopener">${esc(t().pdfOpenLabel)}</a></div>`;
  } else if(activeTab==='plain'){
    body = `<div class="helper-text"><p>${esc(helper(s,'plain'))}</p><p><strong>Reminder:</strong> ${esc(t().helperReminderPlain)}</p></div>`;
  } else if(activeTab==='student'){
    body = `<div class="helper-text"><p>${esc(helper(s,'student'))}</p><p><strong>Reminder:</strong> ${esc(t().helperReminderStudent)}</p></div>`;
  } else {
    body = `<div class="helper-text"><p>${esc(helper(s,'parent'))}</p><p><strong>Reminder:</strong> ${esc(t().helperReminderParent)}</p></div>`;
  }

  const pageLabel = s.pdfPages.length>1 ? t().pdfPages : t().pdfPage;
  const convenience = helperLang==='es' ? `<div class="translation-note">${esc(t().convenience)}</div>` : '';
  const quickAnswer = activePopular && activePopular.sectionId===s.id ? `<div class="quick-answer-card ${isOfficeClarification(activePopular)?'needs-office':''}"><p class="eyebrow">${esc(helperLang==='es'?'Respuesta rápida':'Quick answer')}</p>${isOfficeClarification(activePopular)?`<div class="office-alert">${esc(t().officeBadge)}</div>`:''}<h2>${activePopular.icon} ${esc(popularTitle(activePopular))}</h2><p class="answer-lede"><strong>${esc(helperLang==='es'?'Respuesta rápida:':'Quick answer:')}</strong> ${esc(popularAnswer(activePopular))}</p><ul class="key-list">${popularBullets(activePopular).map(b=>`<li>${esc(b)}</li>`).join('')}</ul><p class="tiny">${esc(helperLang==='es'?'Esta respuesta es una guía. El texto oficial del manual aparece abajo y controla.':'This answer is a guide. The official handbook text appears below and controls.')}</p></div>` : '';
  $('#sectionView').innerHTML = `${convenience}${quickAnswer}
    <p class="eyebrow">${iconFor(s.category)} ${esc(catFor(s.category))}</p>
    <h2>${esc(titleFor(s))}</h2>
    <div class="section-meta"><span class="pill official">${esc(t().sourceLabel)}: ${esc(s.source)}</span><span class="pill">${esc(pageLabel)}: ${s.pdfPages.join(', ')}</span><span class="pill warn">${esc(t().originalControls)}</span><span class="pill lang-pill">${esc(t().langNote)}</span></div>
    <div class="tabs" role="tablist">
      ${['official','pdf','plain','student','parent'].map(tab=>`<button class="tab ${activeTab===tab?'active':''}" data-tab="${tab}">${esc(t().tabs[tab])}</button>`).join('')}
    </div>
    <div class="card"><h3>${activeTab==='official'?esc(t().cardOfficial):(activeTab==='pdf'?esc(t().cardOriginal):esc(t().cardHelper))}</h3>${body}</div>
    <div class="card"><h3>${esc(t().keyDetails)}</h3><ul class="key-list">${keysFor(s).map(k=>`<li>${esc(k)}</li>`).join('')}</ul></div>
    <div class="card"><h3>${esc(t().related)}</h3><div class="related">${relatedButtons(s)}</div></div>
    <div class="card"><h3>${esc(t().finalWord)}</h3><p>${esc(t().finalWordText)}</p><a class="pdf-link" style="display:inline-block;background:var(--green);color:white" href="assets/RHS-Parent-Student-Handbook-2025-26.pdf" target="_blank" rel="noopener">${esc(t().openPdf)}</a></div>`;
  $$('.tab').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab; renderSection();}));
  $$('.related button').forEach(b=>b.addEventListener('click',()=>openSection(b.dataset.id)));
}
function openPopularTopic(topicId){
  activePopular = popularTopics.find(pt=>pt.id===topicId) || activePopular;
  activeSection = sections.find(s=>s.id===activePopular.sectionId) || activeSection;
  activeTab = 'plain';
  renderAll();
  $('#sectionView').scrollIntoView({behavior:'smooth',block:'start'});
  $('#sectionView').focus({preventScroll:true});
}
function openSection(id){activePopular = null; activeSection = sections.find(s=>s.id===id) || activeSection; activeTab='official'; renderSection(); $('#sectionView').scrollIntoView({behavior:'smooth',block:'start'}); $('#sectionView').focus({preventScroll:true});}
function search(q){
  q=q.trim();
  if(!q){$('#searchResults').innerHTML=''; return;}
  const terms=q.toLowerCase().split(/\s+/).filter(Boolean);

  const topicHits = popularTopics.map(pt=>{
    const hay=[pt.title, pt.esTitle || '', pt.category, catFor(pt.category), pt.summary, pt.esSummary || '', pt.answer, pt.esAnswer || '', ...(pt.bullets||[]), ...(pt.esBullets||[])].join(' ').toLowerCase();
    let score=0;
    terms.forEach(term=>{
      if((pt.title+' '+(pt.esTitle||'')).toLowerCase().includes(term)) score+=20;
      if((pt.summary+' '+(pt.esSummary||'')).toLowerCase().includes(term)) score+=10;
      if((pt.answer+' '+(pt.esAnswer||'')).toLowerCase().includes(term)) score+=6;
      if(hay.includes(term)) score+=2;
    });
    return {kind:'topic', item:pt, score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);

  const sectionHits = sections.map(s=>{
    const helperText = [helper(s,'plain'), helper(s,'student'), helper(s,'parent'), ...(keysFor(s)||[]), ...(s.esKeywords||[])].join(' ');
    const hay=[s.title,titleFor(s),s.category,catFor(s.category),s.officialText,s.plain,s.student,s.parent,helperText,s.keywords.join(' '), (s.esKeywords||[]).join(' ')].join(' ').toLowerCase();
    let score=0;
    terms.forEach(term=>{
      if(titleFor(s).toLowerCase().includes(term) || s.title.toLowerCase().includes(term)) score+=8;
      if((s.keywords.join(' ')+' '+(s.esKeywords||[]).join(' ')).toLowerCase().includes(term)) score+=5;
      if(hay.includes(term)) score+=1;
    });
    return {kind:'section', item:s, score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);

  const results = [...topicHits.slice(0,5), ...sectionHits.slice(0,5)].slice(0,10);
  $('#searchResults').innerHTML = results.length ? results.map(({kind,item})=>{
    if(kind==='topic'){
      const q0=q.split(/\s+/)[0];
      const text=[popularSummary(item), popularAnswer(item), ...(popularBullets(item)||[])].join(' ');
      return `<div class="search-hit scenario-hit" data-topic="${item.id}"><strong>${esc(popularTitle(item))}</strong><small>${esc(helperLang==='es'?'Respuesta de escenario':'Scenario answer')} · ${esc(catFor(item.category))}</small><div>${snippet(text, q0)}</div></div>`;
    }
    const s=item;
    return `<div class="search-hit" data-id="${s.id}"><strong>${esc(titleFor(s))}</strong><small>${esc(catFor(s.category))} · ${esc(s.source)}</small><div>${snippet(s.officialText+' '+helper(s,'plain'), q.split(/\s+/)[0])}</div></div>`;
  }).join('') : `<div class="search-hit"><strong>${esc(t().noMatches)}</strong><small>${esc(t().trySearch)}</small></div>`;
  $$('.search-hit[data-topic]').forEach(hit=>hit.addEventListener('click',()=>openPopularTopic(hit.dataset.topic)));
  $$('.search-hit[data-id]').forEach(hit=>hit.addEventListener('click',()=>openSection(hit.dataset.id)));
}
function renderAll(){
  renderLanguageToggle();
  renderStaticLabels();
  renderCategories();
  renderTopics();
  renderScenarios();
  renderSection();
  search($('#searchInput').value || '');
}

$('#searchInput').addEventListener('input', e=>search(e.target.value));
$('#clearSearch').addEventListener('click',()=>{$('#searchInput').value=''; search(''); $('#searchInput').focus();});
$('#showAllBtn').addEventListener('click',()=>{activeCategory='All Sections'; renderAll();});
$('#printBtn').addEventListener('click',()=>window.print());
$('#helperEnglish')?.addEventListener('click',()=>{helperLang='en'; localStorage.setItem('rhsHelperLang','en'); renderAll();});
$('#helperSpanish')?.addEventListener('click',()=>{helperLang='es'; localStorage.setItem('rhsHelperLang','es'); renderAll();});
renderAll();
