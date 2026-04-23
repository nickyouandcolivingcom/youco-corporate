import { Router } from "express";
import passport from "passport";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", (req, res, next) => {
  passport.authenticate(
    "local",
    (
      err: unknown,
      user: Express.User | false,
      info: { message: string } | undefined
    ) => {
      if (err) return next(err);
      if (!user) {
        return res
          .status(401)
          .json({ error: info?.message ?? "Invalid credentials" });
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);
          return res.json({
            id: user.id,
            username: user.username,
            role: user.role,
          });
        });
      });
    }
  )(req, res, next);
});

router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
