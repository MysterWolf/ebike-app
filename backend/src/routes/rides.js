const { Router } = require('express');
const ctrl = require('../controllers/ridesController');

const router = Router();

router.post('/', ctrl.startRide);
router.put('/:id/end', ctrl.endRide);
router.get('/', ctrl.getAllRides);
router.get('/:id', ctrl.getRide);

module.exports = router;
