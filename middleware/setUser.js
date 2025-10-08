export function setUser( req, res, next) {
    if (req.session && req.session.user){
        res.locals.user = req.session.user;
    } else {
        res.locals.user = null;
    }
    next();
};