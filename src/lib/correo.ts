import { supabase } from './supabase'

/**
 * Pide a la Edge Function que vacíe la bandeja de salida.
 *
 * Se llama después de una acción que encola correos, para que lleguen en
 * segundos en vez de esperar al cron. Es DELIBERADAMENTE «dispara y olvida»:
 *
 *   · No se espera el resultado. El usuario acaba de aprobar una solicitud;
 *     hacerle esperar a que Resend responda sería castigarle por una tarea que
 *     no es suya.
 *   · No se muestra el error. Si el envío falla, la fila sigue en la cola con
 *     su motivo, el cron reintentará, y la bitácora lo registra. Un toast rojo
 *     diciendo «falló el correo» tras una aprobación que SÍ funcionó sólo
 *     genera dudas sobre si la aprobación se guardó.
 *
 * La red de seguridad es el cron, no esta llamada.
 */
export function dispararEnvioCorreos() {
  void supabase.functions
    .invoke('enviar-correo', { body: {} })
    .catch((e) => console.warn('No se pudo vaciar la cola de correos ahora:', e))
}
