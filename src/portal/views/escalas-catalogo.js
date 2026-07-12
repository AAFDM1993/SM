export const ESCALAS_CATALOGO = {
  'asrs-v1.1': {
    nombre: 'ASRS v1.1 - Escala de autoevaluación de TDHA en adultos',
    preguntas: [
      { num: 1, texto: '¿Con qué frecuencia tiene dificultades para terminar los detalles finales de un proyecto una vez superada la parte más desafiante?' },
      { num: 2, texto: '¿Con qué frecuencia tiene dificultades para organizar las cosas cuando debe hacer una tarea que requiere orden?' },
      { num: 3, texto: '¿Con qué frecuencia tiene problemas para recordar citas u obligaciones?' },
      { num: 4, texto: 'Cuando debe hacer una tarea que requiere pensar mucho, ¿con qué frecuencia la evita o pospone?' },
      { num: 5, texto: '¿Con qué frecuencia mueve o retuerce las manos o los pies cuando debe estar sentado por largo tiempo?' },
      { num: 6, texto: '¿Con qué frecuencia se siente excesivamente activo y compelido a hacer cosas, como si estuviese impulsado por un motor?' },
      { num: 7, texto: '¿Con qué frecuencia comete errores por descuido cuando trabaja en proyectos aburridos o difíciles?' },
      { num: 8, texto: '¿Con qué frecuencia tiene dificultades para mantener su atención en tareas aburridas o repetitivas?' },
      { num: 9, texto: '¿Con qué frecuencia tiene dificultades para concentrarse en lo que le dicen, incluso cuando le hablan directamente?' },
      { num: 10, texto: '¿Con qué frecuencia pierde cosas o tiene dificultades para encontrarlas en casa o en el trabajo?' },
      { num: 11, texto: '¿Con qué frecuencia se distrae con lo que ocurre a su alrededor?' },
      { num: 12, texto: '¿Con qué frecuencia abandona su asiento en reuniones u otras situaciones en las que se espera que permanezca sentado?' },
      { num: 13, texto: '¿Con qué frecuencia se siente inquieto o agitado?' },
      { num: 14, texto: '¿Con qué frecuencia le resulta difícil relajarse cuando tiene tiempo libre?' },
      { num: 15, texto: '¿Con qué frecuencia se encuentra hablando demasiado en situaciones sociales?' },
      { num: 16, texto: 'Cuando participa en una conversación, ¿con qué frecuencia termina las frases de las personas antes de que ellas puedan hacerlo?' },
      { num: 17, texto: '¿Con qué frecuencia tiene dificultades para esperar su turno cuando le corresponde?' },
      { num: 18, texto: '¿Con qué frecuencia interrumpe a otros cuando están ocupados?' },
    ],
    opciones: ['Nunca', 'Raramente', 'A veces', 'Con frecuencia', 'Con mucha frecuencia'],
  },
};

export function renderPreguntasEscala(escalaTipo, containerEl, idPrefix) {
  const escala = ESCALAS_CATALOGO[escalaTipo];
  if (!escala) return null;
  containerEl.innerHTML = '';
  escala.preguntas.forEach(({ num, texto }) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'view-escalas__pregunta';
    const legend = document.createElement('legend');
    legend.textContent = `${num}. ${texto}`;
    fieldset.appendChild(legend);
    escala.opciones.forEach((label, idx) => {
      const radioLabel = document.createElement('label');
      radioLabel.className = 'view-escalas__opcion';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `${idPrefix}-q${num}`;
      radio.value = String(idx);
      radioLabel.appendChild(radio);
      radioLabel.appendChild(document.createTextNode(` ${label}`));
      fieldset.appendChild(radioLabel);
    });
    containerEl.appendChild(fieldset);
  });
  return function getResponstas() {
    const respuestas = {};
    for (let i = 1; i <= escala.preguntas.length; i++) {
      const checked = containerEl.querySelector(`input[name="${idPrefix}-q${i}"]:checked`);
      if (!checked) return null;
      respuestas[`q${i}`] = Number(checked.value);
    }
    return respuestas;
  };
}
