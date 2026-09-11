// Envuelve un manejador de ruta async para que sus errores lleguen al
// middleware de errores de Express en vez de quedar como promesas no
// controladas (Express 4 no hace esto automáticamente).
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
