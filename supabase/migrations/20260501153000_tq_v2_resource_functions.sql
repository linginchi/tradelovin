-- T+0 V2 资源额度原子操作（P2）
-- 目的：申请/退回资源时保证并发安全，避免公共资源池超分配。

CREATE OR REPLACE FUNCTION public.tq_apply_resource(
	p_user_id UUID,
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
	v_public public.tq_public_resources%ROWTYPE;
	v_user public.tq_user_resources%ROWTYPE;
BEGIN
	IF p_user_id IS NULL THEN
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

	SELECT *
	INTO v_public
	FROM public.tq_public_resources
	WHERE symbol = v_symbol
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION '公共资源池中不存在该标的';
	END IF;

	IF v_side = 'long' THEN
		IF v_public.long_limit < p_quantity THEN
			RAISE EXCEPTION '公共多头资源不足';
		END IF;

		UPDATE public.tq_public_resources
		SET long_limit = long_limit - p_quantity
		WHERE id = v_public.id;

		INSERT INTO public.tq_user_resources(user_id, symbol, long_quota, short_quota)
		VALUES (p_user_id, v_symbol, p_quantity, 0)
		ON CONFLICT(user_id, symbol)
		DO UPDATE SET long_quota = public.tq_user_resources.long_quota + EXCLUDED.long_quota;
	ELSE
		IF v_public.short_limit < p_quantity THEN
			RAISE EXCEPTION '公共空头资源不足';
		END IF;

		UPDATE public.tq_public_resources
		SET short_limit = short_limit - p_quantity
		WHERE id = v_public.id;

		INSERT INTO public.tq_user_resources(user_id, symbol, long_quota, short_quota)
		VALUES (p_user_id, v_symbol, 0, p_quantity)
		ON CONFLICT(user_id, symbol)
		DO UPDATE SET short_quota = public.tq_user_resources.short_quota + EXCLUDED.short_quota;
	END IF;

	SELECT *
	INTO v_user
	FROM public.tq_user_resources
	WHERE user_id = p_user_id
		AND symbol = v_symbol;

	RETURN jsonb_build_object(
		'symbol', v_symbol,
		'side', v_side,
		'quantity', p_quantity,
		'user_long_quota', COALESCE(v_user.long_quota, 0),
		'user_short_quota', COALESCE(v_user.short_quota, 0)
	);
END;
$$;

CREATE OR REPLACE FUNCTION public.tq_return_resource(
	p_user_id UUID,
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
	v_public public.tq_public_resources%ROWTYPE;
	v_user public.tq_user_resources%ROWTYPE;
BEGIN
	IF p_user_id IS NULL THEN
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

	SELECT *
	INTO v_user
	FROM public.tq_user_resources
	WHERE user_id = p_user_id
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
		SET long_quota = long_quota - p_quantity
		WHERE id = v_user.id;
	ELSE
		IF v_user.short_quota < p_quantity THEN
			RAISE EXCEPTION '可退回空头额度不足';
		END IF;
		UPDATE public.tq_user_resources
		SET short_quota = short_quota - p_quantity
		WHERE id = v_user.id;
	END IF;

	INSERT INTO public.tq_public_resources(symbol, name, long_limit, short_limit)
	VALUES (
		v_symbol,
		v_symbol,
		CASE WHEN v_side = 'long' THEN p_quantity ELSE 0 END,
		CASE WHEN v_side = 'short' THEN p_quantity ELSE 0 END
	)
	ON CONFLICT(symbol)
	DO UPDATE SET
		long_limit = public.tq_public_resources.long_limit + EXCLUDED.long_limit,
		short_limit = public.tq_public_resources.short_limit + EXCLUDED.short_limit,
		updated_at = NOW();

	SELECT *
	INTO v_user
	FROM public.tq_user_resources
	WHERE user_id = p_user_id
		AND symbol = v_symbol;

	RETURN jsonb_build_object(
		'symbol', v_symbol,
		'side', v_side,
		'quantity', p_quantity,
		'user_long_quota', COALESCE(v_user.long_quota, 0),
		'user_short_quota', COALESCE(v_user.short_quota, 0)
	);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tq_apply_resource(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tq_return_resource(UUID, TEXT, TEXT, INTEGER) TO authenticated;
