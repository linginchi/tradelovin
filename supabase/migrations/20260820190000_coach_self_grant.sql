-- Coaches may grant quota to themselves without binding another coach.
-- Self-return goes back to the same coach inventory.

CREATE OR REPLACE FUNCTION public.tq_coach_grant_resource(
	p_coach_id UUID,
	p_student_id UUID,
	p_symbol TEXT,
	p_side TEXT,
	p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_symbol TEXT := UPPER(TRIM(p_symbol));
	v_side TEXT := LOWER(TRIM(p_side));
	v_coach public.tq_coach_resources%ROWTYPE;
	v_user public.tq_user_resources%ROWTYPE;
	v_is_coach BOOLEAN := FALSE;
	v_bound BOOLEAN := FALSE;
	v_self_grant BOOLEAN := FALSE;
BEGIN
	IF p_coach_id IS NULL OR p_student_id IS NULL THEN
		RAISE EXCEPTION 'coach_id 与 student_id 不能为空';
	END IF;
	v_self_grant := p_coach_id = p_student_id;
	IF v_symbol = '' THEN
		RAISE EXCEPTION 'symbol 不能为空';
	END IF;
	IF p_quantity IS NULL OR p_quantity <= 0 THEN
		RAISE EXCEPTION 'quantity 必须为正整数';
	END IF;
	IF v_side NOT IN ('long', 'short') THEN
		RAISE EXCEPTION 'side 必须为 long 或 short';
	END IF;

	SELECT COALESCE(is_coach, FALSE)
	INTO v_is_coach
	FROM public.profiles
	WHERE id = p_coach_id;
	IF NOT FOUND OR NOT v_is_coach THEN
		RAISE EXCEPTION '该账号不是金钱豹教练';
	END IF;

	IF NOT v_self_grant THEN
		SELECT TRUE
		INTO v_bound
		FROM public.coach_students
		WHERE coach_id = p_coach_id
			AND student_id = p_student_id
			AND status = 'accepted';
		IF NOT COALESCE(v_bound, FALSE) THEN
			RAISE EXCEPTION '学员尚未绑定该教练';
		END IF;
	END IF;

	SELECT *
	INTO v_coach
	FROM public.tq_coach_resources
	WHERE coach_id = p_coach_id
		AND symbol = v_symbol
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION '教练库存中不存在该标的';
	END IF;

	IF v_side = 'long' THEN
		IF v_coach.long_limit < p_quantity THEN
			RAISE EXCEPTION '教练可做多库存不足';
		END IF;
		UPDATE public.tq_coach_resources
		SET long_limit = long_limit - p_quantity, updated_at = NOW()
		WHERE id = v_coach.id;
		INSERT INTO public.tq_user_resources(user_id, symbol, long_quota, short_quota)
		VALUES (p_student_id, v_symbol, p_quantity, 0)
		ON CONFLICT (user_id, symbol)
		DO UPDATE SET long_quota = public.tq_user_resources.long_quota + EXCLUDED.long_quota, updated_at = NOW();
	ELSE
		IF v_coach.short_limit < p_quantity THEN
			RAISE EXCEPTION '教练可做空库存不足';
		END IF;
		UPDATE public.tq_coach_resources
		SET short_limit = short_limit - p_quantity, updated_at = NOW()
		WHERE id = v_coach.id;
		INSERT INTO public.tq_user_resources(user_id, symbol, long_quota, short_quota)
		VALUES (p_student_id, v_symbol, 0, p_quantity)
		ON CONFLICT (user_id, symbol)
		DO UPDATE SET short_quota = public.tq_user_resources.short_quota + EXCLUDED.short_quota, updated_at = NOW();
	END IF;

	SELECT *
	INTO v_user
	FROM public.tq_user_resources
	WHERE user_id = p_student_id
		AND symbol = v_symbol;

	RETURN jsonb_build_object(
		'symbol', v_symbol,
		'side', v_side,
		'quantity', p_quantity,
		'coach_id', p_coach_id,
		'student_id', p_student_id,
		'user_long_quota', COALESCE(v_user.long_quota, 0),
		'user_short_quota', COALESCE(v_user.short_quota, 0)
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.tq_coach_return_resource(
	p_student_id UUID,
	p_symbol TEXT,
	p_side TEXT,
	p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_symbol TEXT := UPPER(TRIM(p_symbol));
	v_side TEXT := LOWER(TRIM(p_side));
	v_coach_id UUID;
	v_user public.tq_user_resources%ROWTYPE;
	v_is_coach BOOLEAN := FALSE;
BEGIN
	IF p_student_id IS NULL THEN
		RAISE EXCEPTION 'user_id 不能为空';
	END IF;
	IF v_symbol = '' THEN
		RAISE EXCEPTION 'symbol 不能为空';
	END IF;
	IF p_quantity IS NULL OR p_quantity <= 0 THEN
		RAISE EXCEPTION 'quantity 必须为正整数';
	END IF;
	IF v_side NOT IN ('long', 'short') THEN
		RAISE EXCEPTION 'side 必须为 long 或 short';
	END IF;

	SELECT coach_id
	INTO v_coach_id
	FROM public.coach_students
	WHERE student_id = p_student_id
		AND status = 'accepted';
	IF v_coach_id IS NULL THEN
		SELECT COALESCE(is_coach, FALSE)
		INTO v_is_coach
		FROM public.profiles
		WHERE id = p_student_id;
		IF COALESCE(v_is_coach, FALSE) THEN
			v_coach_id := p_student_id;
		ELSE
			RAISE EXCEPTION '请先绑定金钱豹教练后再退回额度';
		END IF;
	END IF;

	SELECT *
	INTO v_user
	FROM public.tq_user_resources
	WHERE user_id = p_student_id
		AND symbol = v_symbol
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION '用户没有该标的额度';
	END IF;

	IF v_side = 'long' THEN
		IF v_user.long_quota < p_quantity THEN
			RAISE EXCEPTION '可退回多头额度不足';
		END IF;
		UPDATE public.tq_user_resources
		SET long_quota = long_quota - p_quantity, updated_at = NOW()
		WHERE id = v_user.id;
	ELSE
		IF v_user.short_quota < p_quantity THEN
			RAISE EXCEPTION '可退回空头额度不足';
		END IF;
		UPDATE public.tq_user_resources
		SET short_quota = short_quota - p_quantity, updated_at = NOW()
		WHERE id = v_user.id;
	END IF;

	INSERT INTO public.tq_coach_resources(coach_id, symbol, name, long_limit, short_limit)
	VALUES (
		v_coach_id,
		v_symbol,
		v_symbol,
		CASE WHEN v_side = 'long' THEN p_quantity ELSE 0 END,
		CASE WHEN v_side = 'short' THEN p_quantity ELSE 0 END
	)
	ON CONFLICT (coach_id, symbol)
	DO UPDATE SET
		long_limit = public.tq_coach_resources.long_limit + EXCLUDED.long_limit,
		short_limit = public.tq_coach_resources.short_limit + EXCLUDED.short_limit,
		updated_at = NOW();

	SELECT *
	INTO v_user
	FROM public.tq_user_resources
	WHERE user_id = p_student_id
		AND symbol = v_symbol;

	RETURN jsonb_build_object(
		'symbol', v_symbol,
		'side', v_side,
		'quantity', p_quantity,
		'coach_id', v_coach_id,
		'student_id', p_student_id,
		'user_long_quota', COALESCE(v_user.long_quota, 0),
		'user_short_quota', COALESCE(v_user.short_quota, 0)
	);
END;
$$;
